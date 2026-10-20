"""Assemble and relocate the native OpenFOAM runtime built by this profile."""

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / ".tools/cfd/build/openfoam"
INSTALL = ROOT / ".tools/cfd/install/openfoam"
OPTIONS = "darwin64ClangDPInt32Opt"
MPI = ROOT / ".tools/cfd/deps/openmpi-4.1.8-sdk"
DEPENDENCIES = ROOT / ".tools/cfd/build/openfoam-dependencies"
MACHO = {b"\xcf\xfa\xed\xfe", b"\xfe\xed\xfa\xcf"}
SYSTEM = ("/usr/lib/", "/System/Library/")
REQUIRED = (
    "blockMesh", "checkMesh", "icoFoam", "foamDictionary", "decomposePar",
    "reconstructPar", "reconstructParMesh", "snappyHexMesh",
    "surfaceFeatureExtract", "cartesianMesh", "surfaceFeatureEdges", "preparePar",
    "simpleFoam", "pimpleFoam", "porousSimpleFoam", "SRFSimpleFoam",
    "buoyantSimpleFoam", "buoyantPimpleFoam", "interFoam", "multiphaseInterFoam",
    "hisa", "foamToVTK", "foamToSurface", "gmshToFoam", "createPatch",
    "createBaffles", "topoSet", "setFields", "changeDictionary", "renumberMesh",
    "potentialFoam", "mergeMeshes", "transformPoints", "polyDualMesh",
    "flattenMesh", "extrudeMesh", "mapFields",
)


def macho(path):
    if path.is_symlink() or not path.is_file():
        return False
    with path.open("rb") as source:
        return source.read(4) in MACHO


def fingerprint(directory):
    """Bind smoke evidence to paths, modes, link targets, and every file byte."""
    digest = hashlib.sha256()
    for path in sorted(directory.rglob("*")):
        if path.name == "runtime-manifest.json" and path.parent == directory:
            continue
        if path.is_dir() and not path.is_symlink():
            continue
        digest.update(path.relative_to(directory).as_posix().encode() + b"\0")
        if path.is_symlink():
            digest.update(b"link\0" + os.readlink(path).encode())
        else:
            digest.update(b"file\0" + str(path.stat().st_mode & 0o777).encode() + b"\0")
            with path.open("rb") as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    digest.update(chunk)
        digest.update(b"\0")
    return digest.hexdigest()


def copy_libraries(source, destination, *, recursive=True):
    for path in sorted(source.rglob("*.dylib") if recursive else source.glob("*.dylib")):
        relative = path.relative_to(source)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() or target.is_symlink():
            target.unlink()
        if path.is_symlink():
            link = os.readlink(path)
            if os.path.isabs(link):
                raise RuntimeError(f"Unexpected absolute dependency symlink: {relative}")
            target.symlink_to(link)
        else:
            shutil.copy2(path, target)


def assemble(destination):
    platform = destination / "platforms" / OPTIONS
    for name in ("bin", "etc"):
        shutil.copytree(BUILD / name, destination / name, symlinks=True)
    (destination / "META-INFO").mkdir()
    for name in ("api-info", "build-info"):
        shutil.copy2(BUILD / "META-INFO" / name, destination / "META-INFO" / name)
    (platform / "bin").mkdir(parents=True)
    (platform / "lib").mkdir()
    for source in (BUILD / "platforms" / OPTIONS,
                   BUILD / ".lmbox-user/platforms" / OPTIONS):
        if (source / "bin").exists():
            for path in (source / "bin").iterdir():
                if macho(path):
                    shutil.copy2(path, platform / "bin" / path.name)
        copy_libraries(source / "lib", platform / "lib")
    mpi_pstream = platform / "lib/openmpi-4.1.8/libPstream.dylib"
    if not mpi_pstream.is_file():
        raise RuntimeError("Build the real MPI Pstream adapter before packaging")
    # All consumers, including the serial commands, share the MPI-capable ABI.
    shutil.copy2(mpi_pstream, platform / "lib/libPstream.dylib")
    for directory in ("dummy", "openmpi-4.1.8"):
        target = platform / "lib" / directory / "libPstream.dylib"
        target.unlink()
        target.symlink_to("../libPstream.dylib")
    for name, location in (
        ("libscotchDecomp.dylib", "../libscotchDecomp.dylib"),
        ("libptscotchDecomp.dylib", "../openmpi-4.1.8/libptscotchDecomp.dylib"),
    ):
        target = platform / "lib/dummy" / name
        target.unlink()
        target.symlink_to(location)
    copy_libraries(DEPENDENCIES / "openmp/lib", platform / "lib", recursive=False)
    copy_libraries(DEPENDENCIES / "scotch/lib", platform / "lib", recursive=False)
    if not (MPI / "bin/mpiexec").is_file():
        raise RuntimeError("The validated private MPI SDK is missing")
    shutil.copytree(MPI / "bin", destination / "mpi/bin", symlinks=True)
    shutil.copytree(MPI / "share/openmpi", destination / "mpi/share/openmpi", symlinks=True)
    shutil.copytree(MPI / "share/pmix", destination / "mpi/share/pmix", symlinks=True)
    if (MPI / "etc").exists():
        shutil.copytree(MPI / "etc", destination / "mpi/etc", symlinks=True)
    copy_libraries(MPI / "lib", destination / "mpi/lib")
    # Compiler wrappers and development commands are not runtime capabilities.
    for path in (destination / "mpi/bin").iterdir():
        if path.name not in ("mpiexec", "mpirun", "orterun", "orted", "ompi_info"):
            path.unlink()
    for command in REQUIRED:
        if not (platform / "bin" / command).is_file():
            raise RuntimeError(f"Required command was not built: {command}")
        target = destination / "bin" / command
        target.symlink_to(f"../platforms/{OPTIONS}/bin/{command}")
    (destination / "lib").symlink_to(f"platforms/{OPTIONS}/lib")
    (destination / "ThirdParty").mkdir()
    (destination / "etc/prefs.sh").write_text(
        'export FOAM_CONFIG_MODE=o\n'
        'export PATH=/usr/bin:/bin:/usr/sbin:/sbin\n'
        'unset DYLD_LIBRARY_PATH DYLD_FALLBACK_LIBRARY_PATH LD_LIBRARY_PATH\n'
        'for lmbox_mpi_variable in $(env | sed -nE \'s/^((OMPI|OPAL|PMIX|PRTE)_[A-Za-z0-9_]*)=.*/\\1/p\'); do\n'
        '    unset "$lmbox_mpi_variable"\n'
        'done\n'
        'unset lmbox_mpi_variable\n'
        'export OPAL_PREFIX="$WM_PROJECT_DIR/mpi"\n'
        'export WM_COMPILER=Clang WM_MPLIB=OPENMPI-4.1.8\n'
        'export WM_COMPILE_CONTROL="~openmp"\n'
        'export WM_PROJECT_USER_DIR="${LMBOX_OPENFOAM_USER_DIR:-${TMPDIR:-/tmp}/lmbox-openfoam-user}"\n'
        'unset WM_PROJECT_SITE\n'
    )
    (destination / "etc/config.sh/prefs.openmpi").write_text(
        'export MPI_ARCH_PATH="$WM_PROJECT_DIR/mpi"\n'
    )
    bashrc = destination / "etc/bashrc"
    bashrc.write_bytes(Path(__file__).with_name("openfoam-runtime.bashrc").read_bytes())
    etcfile = destination / "bin/foamEtcFile"
    etcfile.write_text(etcfile.read_text().replace(
        r"\cd $(dirname $binDir)", r'\cd "$(dirname "$binDir")"'
    ))
    control = destination / "etc/controlDict"
    control.write_text(control.read_text().replace(
        "allowSpaceInFileName    0;", "allowSpaceInFileName    1;"
    ))
    licenses = destination / "licenses"
    licenses.mkdir()
    shutil.copytree(MPI / "share/licenses/openmpi", licenses / "OpenMPI")
    shutil.copy2(ROOT / "runtime/openfoam/COPYING", licenses / "OpenFOAM-GPL-3.0.txt")
    shutil.copy2(ROOT / ".tools/cfd/build/openfoam-extensions/hisa-master/LICENSE",
                 licenses / "HiSA-license.txt")
    shutil.copy2(ROOT / ".tools/cfd/build/openfoam-dependency-sources/openmp/LICENSE.TXT",
                 licenses / "LLVM-OpenMP-license.txt")
    # cfMesh distributes the GPL notice in each source file and its manual.
    shutil.copy2(ROOT / "runtime/openfoam/COPYING", licenses / "cfMesh-GPL-3.0.txt")
    cfmesh_notice = ROOT / ".tools/cfd/build/openfoam-extensions/cfmesh-cfdof/meshLibrary/voronoiMesh/voronoiMeshGenerator/voronoiMeshGenerator.C"
    (licenses / "cfMesh-copyright.txt").write_text(
        cfmesh_notice.read_text().split(r"\*---------------------------------------------------------------------------*/", 1)[0]
        + "\\*---------------------------------------------------------------------------*/\n"
    )
    for name, source in (
        ("Scotch-license.txt", ROOT / ".tools/cfd/build/openfoam-dependency-sources/scotch/LICENSE_en.txt"),
    ):
        if not source.is_file():
            raise RuntimeError(f"Required license missing: {source.name}")
        shutil.copy2(source, licenses / name)


def relocate(directory):
    files = [path for path in directory.rglob("*") if macho(path)]
    libraries = {}
    for path in directory.rglob("*.dylib"):
        resolved = path.resolve(strict=True)
        if path.name in libraries and libraries[path.name] != resolved:
            raise RuntimeError(f"Ambiguous runtime library: {path.name}")
        libraries[path.name] = resolved
    for path in files:
        architecture = subprocess.check_output(["lipo", "-archs", str(path)], text=True).strip()
        if architecture != "arm64":
            raise RuntimeError(f"Expected arm64: {path.relative_to(directory)}")
        commands = subprocess.check_output(["otool", "-l", str(path)], text=True)
        edits = []
        for block in re.split(r"\nLoad command \d+\n", commands):
            command = re.search(r"(?m)^\s*cmd (\S+)\s*$", block)
            if not command:
                continue
            kind = command.group(1)
            if kind == "LC_RPATH":
                value = re.search(r"\s+path (.+) \(offset \d+\)", block).group(1)
                edits += ["-delete_rpath", value]
            elif kind == "LC_ID_DYLIB":
                edits += ["-id", "@rpath/" + path.name]
            elif kind in ("LC_LOAD_DYLIB", "LC_LOAD_WEAK_DYLIB", "LC_REEXPORT_DYLIB",
                          "LC_LOAD_UPWARD_DYLIB", "LC_LAZY_LOAD_DYLIB"):
                value = re.search(r"\s+name (.+) \(offset \d+\)", block).group(1)
                if value.startswith(SYSTEM):
                    continue
                name = Path(value).name
                target = libraries.get(name)
                if target is None:
                    raise RuntimeError(f"Unbundled dependency {name} in {path.name}")
                replacement = "@loader_path/" + os.path.relpath(target, path.parent)
                if value != replacement:
                    edits += ["-change", value, replacement]
        if edits:
            subprocess.run(["install_name_tool", *edits, str(path)], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        subprocess.run(["codesign", "--force", "--sign", "-", str(path)], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    return len(files)


def verify_build_inputs():
    source = json.loads((ROOT / "runtime/openfoam/source.json").read_text())
    expected = {
        "archive": source["sha256"],
        "caseMap": hashlib.sha256((ROOT / "runtime/openfoam/case-map.json").read_bytes()).hexdigest(),
    }
    if json.loads((BUILD / ".lmbox-build-source.json").read_text()) != expected:
        raise RuntimeError("The binaries' source checkout differs from the selected source pin")
    for name, arguments in (
        ("openfoam-build.py", ["prepare"]),
        ("openfoam-extensions.py", ["cfmesh-cfdof", "--prepare-only"]),
        ("openfoam-extensions.py", ["hisa-master", "--prepare-only"]),
    ):
        subprocess.run([sys.executable, "-B", str(Path(__file__).with_name(name)), *arguments],
                       check=True)
    cfmesh = ROOT / ".tools/cfd/build/openfoam-extensions/cfmesh-cfdof"
    receipt = json.loads((cfmesh / ".lmbox-build.json").read_text())
    library = BUILD / ".lmbox-user/platforms" / OPTIONS / "lib/libmeshLibrary.dylib"
    if (receipt["sourceSha256"] != json.loads((cfmesh / ".lmbox-source.json").read_text())["sha256"]
            or receipt["patches"] != ["boundary-face-snapshot-before-parallel-face-growth",
                                      "propagate-cell-levels-across-processor-boundaries"]
            or receipt["librarySha256"] != hashlib.sha256(library.read_bytes()).hexdigest()):
        raise RuntimeError("Rebuild cfMesh with the declared boundary-face lifetime patch")
    patched_sources = (
        "meshLibrary/utilities/boundaryLayers/boundaryLayers/boundaryLayerCells.C",
        "meshLibrary/utilities/boundaryLayers/boundaryLayers/boundaryLayersFacesAndCells.C",
        "meshLibrary/utilities/meshes/polyMeshGen/polyMeshGen.C",
    )
    if receipt.get("patchedSources") != {
        path: hashlib.sha256((cfmesh / path).read_bytes()).hexdigest() for path in patched_sources
    }:
        raise RuntimeError("The compiled cfMesh patch receipt differs from its source files")
    mpi = json.loads((MPI / "lmbox-mpi.json").read_text())
    parallel = json.loads((DEPENDENCIES / "parallel-source.json").read_text())
    if mpi["smoke"]["status"] != "passed" or parallel["openmpi"] != mpi["source"]:
        raise RuntimeError("The MPI adapter source receipt differs from its validated SDK")


def record_installation(directory, count):
    versions = set()
    for path in directory.rglob("*"):
        if not macho(path):
            continue
        output = subprocess.check_output(["otool", "-l", str(path)], text=True)
        match = re.search(r"(?m)^\s*minos (\d+(?:\.\d+){1,2})\s*$", output)
        if not match:
            raise RuntimeError(f"Missing minimum macOS load command: {path.name}")
        versions.add(match.group(1))
    minimum = max(versions, key=lambda value: tuple(map(int, value.split("."))))
    source = json.loads((ROOT / "runtime/openfoam/source.json").read_text())
    extensions = ROOT / ".tools/cfd/build/openfoam-extensions"
    manifest = {
        "schemaVersion": 1, "component": "openfoam",
        "sourceCommit": source["commit"], "target": "darwin-arm64",
        "minimumMacOS": minimum, "version": "v2306",
        "commands": list(REQUIRED) + ["mpiexec", "mpirun"],
        "capabilities": {
            "meshers": ["cfMesh", "snappyHexMesh"],
            "solvers": ["simpleFoam", "pimpleFoam", "porousSimpleFoam", "SRFSimpleFoam",
                        "buoyantSimpleFoam", "buoyantPimpleFoam", "interFoam",
                        "multiphaseInterFoam", "hisa"],
            "parallel": {"implementation": "OpenMPI", "version": "4.1.8",
                         "decomposition": ["scotch", "ptscotch"]},
            "optionalExternalMeshers": ["gmsh"],
            "dynamicCodeCompilation": False,
        },
        "sources": {
            "openfoam": {"repository": source["repository"], "ref": source["ref"],
                         "commit": source["commit"], "sha256": source["sha256"]},
            "cfMesh": json.loads((extensions / "cfmesh-cfdof/.lmbox-source.json").read_text()),
            "cfMeshBuild": json.loads((extensions / "cfmesh-cfdof/.lmbox-build.json").read_text()),
            "HiSA": json.loads((extensions / "hisa-master/.lmbox-source.json").read_text()),
            "OpenMP": json.loads((DEPENDENCIES / "openmp/source.json").read_text()),
            "parallel": json.loads((DEPENDENCIES / "parallel-source.json").read_text()),
        },
        "licenses": "licenses",
        "smoke": {"status": "not-run", "checks": [], "machOFiles": count,
                  "artifactSha256": fingerprint(directory)},
    }
    (directory / "runtime-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


def verify_and_manifest(directory, count):
    manifest_path = directory / "runtime-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    source = json.loads((ROOT / "runtime/openfoam/source.json").read_text())
    before = fingerprint(directory)
    if (manifest.get("sourceCommit") != source["commit"]
            or manifest.get("sources", {}).get("openfoam", {}).get("sha256") != source["sha256"]
            or manifest.get("smoke", {}).get("artifactSha256") != before):
        raise RuntimeError("Installed source identity or artifacts changed; rebuild instead of relabelling")
    manifest["smoke"]["status"] = "not-run"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    spec = importlib.util.spec_from_file_location(
        "lmbox_openfoam_smoke", Path(__file__).with_name("openfoam-smoke.py")
    )
    smoke = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(smoke)
    evidence = ROOT / ".tools/cfd/build/openfoam-installed-smoke"
    evidence.mkdir(parents=True, exist_ok=True)
    relocation = Path(tempfile.mkdtemp(prefix="relocation-", dir=evidence))
    moved = relocation / "runtime with spaces"
    shutil.copytree(directory, moved, symlinks=True)
    if fingerprint(moved) != before:
        raise RuntimeError("The relocated copy differs from the installed runtime")
    checks = [smoke.activation_isolation(moved, evidence)]
    for command in REQUIRED:
        smoke.run(moved, evidence, command, "-help", label="help-" + command)
    checks.append({"status": "passed", "name": "all required command entrypoints",
                   "commands": list(REQUIRED)})
    for command, expected in (("cartesianMesh", "1.32"), ("hisa", "1.13.4")):
        output = smoke.run(moved, evidence, command, "-version", label="version-" + command)
        if expected not in output:
            raise RuntimeError(f"Unexpected {command} version")
    checks.append({"status": "passed", "name": "CfdOF extension version probes",
                   "cfMesh": "1.32", "HiSA": "1.13.4"})
    checks += [smoke.cavity(moved, evidence), smoke.cavity(moved, evidence, parallel=4),
               smoke.cfmesh(moved, evidence, parallel=4), smoke.hisa(moved, evidence)]
    if fingerprint(moved) != before:
        raise RuntimeError("Smoke altered the relocated runtime")
    manifest["capabilities"]["parallel"]["verifiedProcesses"] = 4
    manifest["smoke"] = {"status": "passed",
                         "checks": [check.get("name", check.get("case")) +
                                    (f" ({check['processes']} processes)" if "processes" in check else "")
                                    for check in checks],
                         "details": checks, "machOFiles": count,
                         "relocatedDirectoryWithSpaces": True, "artifactSha256": before}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    (evidence / "smoke.json").write_text(json.dumps(manifest["smoke"], indent=2) + "\n")
    # Keep evidence and solver cases; the identical temporary runtime is expendable.
    shutil.rmtree(relocation)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", type=Path, default=INSTALL)
    parser.add_argument("--verify-existing", action="store_true")
    args = parser.parse_args()
    destination = args.destination.resolve()
    if args.verify_existing:
        manifest = verify_and_manifest(destination, sum(macho(p) for p in destination.rglob("*")))
        print(json.dumps(manifest["smoke"], indent=2))
        return
    if destination.exists():
        raise RuntimeError("Preserve or move the existing install before rebuilding it")
    destination.parent.mkdir(parents=True, exist_ok=True)
    verify_build_inputs()
    staging = Path(tempfile.mkdtemp(prefix="openfoam-stage-", dir=destination.parent))
    assemble(staging)
    count = relocate(staging)
    staging.rename(destination)
    record_installation(destination, count)
    verify_and_manifest(destination, count)
    print(json.dumps({"installed": str(destination.relative_to(ROOT)), "machOFiles": count}))


if __name__ == "__main__":
    main()
