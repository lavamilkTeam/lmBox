"""Build the pinned CfdOF mesh and compressible-flow extensions locally."""

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zipfile
from openfoam_sources import acquire


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("lmbox_openfoam_build", Path(__file__).with_name("openfoam-build.py"))
BUILD_MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD_MODULE)
EXTENSIONS = {
    "cfmesh-cfdof": {
        "version": "1.32",
        "url": "https://sourceforge.net/projects/cfmesh-cfdof/files/cfmesh-cfdof.zip/download",
        "sha256": "47cfc7c670e7e23696cbba60f18a0182ed918e3c4b241492c563c2310f076378",
        "libraries": ["meshLibrary"],
        "applications": ["executables/cartesianMesh", "utilities/surfaceFeatureEdges", "utilities/preparePar"],
    },
    "hisa-master": {
        "version": "1.13.4",
        "url": "https://sourceforge.net/projects/hisa/files/hisa-master.zip/download",
        "sha256": "5c99093e67defb7f8af0ce967bd0d2907d7ccfaa45bf8bf982e84646dad144e6",
        "libraries": [
            "src/finiteVolume", "src/preconditioners", "src/solvers",
            "src/functionObjects", "src/meshRebalancing",
            "src/modules/solver", "src/modules/hisa",
        ],
        "applications": ["applications/singleRegionSolvers/hisa"],
    },
}
CFMESH_PATCH = "boundary-face-snapshot-before-parallel-face-growth"
CFMESH_LEVEL_PATCH = "propagate-cell-levels-across-processor-boundaries"
CFMESH_BOUNDARY = "meshLibrary/utilities/boundaryLayers/boundaryLayers/"


def cfmesh_boundary_patch(relative, data):
    """Keep pre-growth faces alive while processor faces resize mesh storage."""
    if str(relative) == "meshLibrary/utilities/meshes/polyMeshGen/polyMeshGen.C":
        start = data.index(b"void polyMeshGen::fillInCellAndPointLevels()")
        end = data.index(b"void polyMeshGen::read()", start)
        if hashlib.sha256(data[start:end]).hexdigest() != "c473e6aaea2f5385648fdcb28f7b50be60d4a3b72d5542bde40909684872c57e":
            raise ValueError("Unsupported cfMesh cell level source")
        includes = b'#include "PstreamBuffers.H"\n#include "UOPstream.H"\n#include "UIPstream.H"\n#include "PstreamReduceOps.H"\n'
        replacement = Path(__file__).with_name("openfoam-cfmesh-levels.C").read_bytes()
        return includes + data[:start] + replacement + b"\n" + data[end:]
    if str(relative) not in (
        CFMESH_BOUNDARY + "boundaryLayerCells.C",
        CFMESH_BOUNDARY + "boundaryLayersFacesAndCells.C",
    ):
        return data
    original = b"    const faceList::subList& bFaces = mse.boundaryFaces();"
    replacement = (
        b"    // Processor-face insertion can reallocate mesh_.faces().\n"
        b"    const faceList bFaces(mse.boundaryFaces());"
    )
    if original not in data:
        raise ValueError(f"Unsupported cfMesh boundary face source: {relative}")
    data = data.replace(original, replacement, 1)
    if str(relative).endswith("/boundaryLayerCells.C"):
        original = b"        createNewFacesParallel(treatPatches);"
        replacement = (
            b"        // Cache point addressing while the boundary-face view is valid.\n"
            b"        mse.globalToLocalBndPointAddressing();\n"
            b"        createNewFacesParallel(treatPatches);"
        )
        if data.count(original) != 1:
            raise ValueError("Unsupported cfMesh parallel layer source")
        data = data.replace(original, replacement)
    return data


def openmp_flags(content):
    return content.replace(
        "OMP_FLAGS = -DUSE_OMP -Xclang -fopenmp\n",
        "OMP_FLAGS = -DUSE_OMP -Xclang -fopenmp -isystem $(LMBOX_OPENMP)/include\n",
    ).replace(
        "OMP_LIBS = -lomp\n",
        "OMP_LIBS = -L$(LMBOX_OPENMP)/lib -lomp -Wl,-rpath,$(LMBOX_OPENMP)/lib\n",
    )


def prepare(name):
    settings = EXTENSIONS[name]
    archive = acquire(name + ".zip", settings["url"], settings["sha256"])
    destination = ROOT / ".tools/cfd/build/openfoam-extensions" / name
    marker = destination / ".lmbox-source.json"
    existing = destination.exists()
    if existing:
        if not marker.is_file() or json.loads(marker.read_text()) != settings:
            raise ValueError(f"Unexpected existing extension directory: {name}")
    names = json.loads((ROOT / "runtime/openfoam/case-map.json").read_text())["filenameRenames"]
    tokens = re.compile(rb"[A-Za-z0-9_.+-]+")
    expected_paths = set()
    with zipfile.ZipFile(archive) as source:
        for entry in source.infolist():
            path = PurePosixPath(entry.filename)
            if path.is_absolute() or ".." in path.parts or path.parts[0] != name:
                raise ValueError(f"Unsafe extension archive path: {entry.filename}")
            relative = path.relative_to(name)
            if str(relative) == ".":
                continue
            relative = relative.with_name(names.get(relative.name, relative.name))
            target = destination / relative
            expected_paths.add(relative)
            if entry.is_dir():
                if existing:
                    if target.is_symlink() or not target.is_dir():
                        raise ValueError(f"Changed extension directory: {relative}")
                else:
                    target.mkdir(parents=True, exist_ok=True)
                continue
            mode = entry.external_attr >> 16
            if stat.S_ISLNK(mode):
                raise ValueError("Extension archive symlinks require explicit handling")
            data = source.read(entry)
            if (not relative.name.lower().startswith(("readme", "license", "copying", "copyright"))
                    and b"\0" not in data):
                data = tokens.sub(lambda match: names.get(match.group().decode("ascii"), match.group().decode("ascii")).encode(), data)
            expected_mode = (mode & 0o777) or 0o644
            patched = cfmesh_boundary_patch(relative, data) if name == "cfmesh-cfdof" else data
            if existing:
                allowed = [data, patched]
                if name == "cfmesh-cfdof" and str(relative) == "buildDefs.include":
                    allowed.append(openmp_flags(data.decode()).encode())
                if (target.is_symlink() or not target.is_file() or target.read_bytes() not in allowed
                        or target.stat().st_mode & 0o777 != expected_mode):
                    raise ValueError(f"Modified extension source: {relative}")
                if patched != data and target.read_bytes() == data:
                    target.write_bytes(patched)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(patched)
                target.chmod(expected_mode)
    for target in destination.rglob("*"):
        relative = target.relative_to(destination)
        if "lnInclude" in relative.parts or "Make" in relative.parts:
            continue
        if target.suffix in (".C", ".H", ".c", ".h", ".cpp", ".hpp", ".cc", ".cxx") and relative not in expected_paths:
            raise ValueError(f"Unexpected extension source: {relative}")
    if not existing:
        marker.write_text(json.dumps(settings, indent=2) + "\n")
    return destination


def build(name, jobs):
    directory = prepare(name)
    settings = EXTENSIONS[name]
    if name == "cfmesh-cfdof":
        openmp = ROOT / ".tools/cfd/build/openfoam-dependencies/openmp"
        if not (openmp / "lib/libomp.dylib").is_file():
            raise RuntimeError("Build LLVM OpenMP with openfoam-openmp.py first")
        os.environ["LMBOX_OPENMP"] = str(openmp)
        definitions = directory / "buildDefs.include"
        definitions.write_text(openmp_flags(definitions.read_text()))
    # HiSA uses the upstream implementation of topology changes and thermo tools.
    if name == "hisa-master":
        for library in ("topoChangerFvMesh", "thermoTools"):
            BUILD_MODULE.foam(
                ["./wmake/wmake", f"-j{jobs}", "libso", "src/" + library],
                "extension-prerequisite-" + library,
            )
    for target in settings["libraries"]:
        BUILD_MODULE.foam(
            ["./wmake/wmake", f"-j{jobs}", "libso", str(directory / target)],
            name + "-" + target,
        )
    for target in settings["applications"]:
        BUILD_MODULE.foam(
            ["./wmake/wmake", f"-j{jobs}", str(directory / target)],
            name + "-" + target,
        )
    if name == "cfmesh-cfdof":
        library = BUILD_MODULE.BUILD / ".lmbox-user/platforms" / BUILD_MODULE.OPTIONS / "lib/libmeshLibrary.dylib"
        receipt = {
            "sourceSha256": settings["sha256"], "patches": [CFMESH_PATCH, CFMESH_LEVEL_PATCH],
            "librarySha256": hashlib.sha256(library.read_bytes()).hexdigest(),
            "patchedSources": {
                path: hashlib.sha256((directory / path).read_bytes()).hexdigest()
                for path in (
                    CFMESH_BOUNDARY + "boundaryLayerCells.C",
                    CFMESH_BOUNDARY + "boundaryLayersFacesAndCells.C",
                    "meshLibrary/utilities/meshes/polyMeshGen/polyMeshGen.C",
                )
            },
        }
        (directory / ".lmbox-build.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("component", choices=EXTENSIONS)
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--jobs", type=int, choices=range(1, 7), default=3)
    args = parser.parse_args()
    try:
        if args.prepare_only:
            prepare(args.component)
        else:
            build(args.component, args.jobs)
    except (ValueError, RuntimeError, OSError) as error:
        sys.exit(f"OpenFOAM extension failed: {error}")
