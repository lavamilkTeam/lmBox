"""Build the project-local OpenFOAM command closure on macOS arm64."""

import argparse
import json
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "runtime/openfoam/source"
BUILD = ROOT / ".tools/cfd/build/openfoam"
INSTALL = ROOT / ".tools/cfd/install/openfoam"
LOGS = ROOT / ".tools/cfd/build/openfoam-logs"
OPTIONS = "darwin64ClangDPInt32Opt"
JOBS = 6

CORE_LIBRARIES = [
    "fileFormats",
    "surfMesh",
    "meshTools",
    "finiteVolume",
    "mesh/blockMesh",
    "mesh/extrudeModel",
    "dynamicMesh",
]
CORE_APPLICATIONS = [
    "utilities/miscellaneous/foamDictionary",
    "utilities/mesh/generation/blockMesh",
    "utilities/mesh/manipulation/checkMesh",
    "solvers/incompressible/icoFoam",
]
CFD_APPLICATIONS = [
    "utilities/mesh/generation/snappyHexMesh",
    "utilities/surface/surfaceFeatureExtract",
    "utilities/mesh/manipulation/createPatch",
    "utilities/mesh/manipulation/createBaffles",
    "utilities/mesh/manipulation/mergeMeshes",
    "utilities/mesh/manipulation/topoSet",
    "utilities/mesh/manipulation/renumberMesh",
    "utilities/mesh/manipulation/transformPoints",
    "utilities/mesh/manipulation/polyDualMesh",
    "utilities/mesh/manipulation/flattenMesh",
    "utilities/mesh/generation/extrude/extrudeMesh",
    "utilities/mesh/conversion/gmshToFoam",
    "utilities/mesh/conversion/foamToSurface",
    "utilities/parallelProcessing/decomposePar",
    "utilities/parallelProcessing/reconstructPar",
    "utilities/parallelProcessing/reconstructParMesh",
    "utilities/preProcessing/changeDictionary",
    "utilities/preProcessing/setFields",
    "utilities/preProcessing/mapFields",
    "utilities/postProcessing/dataConversion/foamToVTK",
    "solvers/basic/potentialFoam",
    "solvers/incompressible/simpleFoam",
    "solvers/incompressible/pimpleFoam",
    "solvers/incompressible/simpleFoam/porousSimpleFoam",
    "solvers/incompressible/simpleFoam/SRFSimpleFoam",
    "solvers/heatTransfer/buoyantSimpleFoam",
    "solvers/heatTransfer/buoyantPimpleFoam",
    "solvers/multiphase/interFoam",
    "solvers/multiphase/multiphaseInterFoam",
]


def run(command, label, cwd=BUILD):
    LOGS.mkdir(parents=True, exist_ok=True)
    log_path = LOGS / (label.replace("/", "-") + ".log")
    print(f"[OpenFOAM] {label} -> {log_path.relative_to(ROOT)}", flush=True)
    with log_path.open("w") as log:
        result = subprocess.run(command, cwd=cwd, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode:
        print("\n".join(log_path.read_text(errors="replace").splitlines()[-65:]), file=sys.stderr)
        raise RuntimeError(f"{label} failed ({result.returncode}); see {log_path}")


def foam(command, label):
    # Positional arguments keep workspace paths out of shell source.
    script = """
export FOAM_CONFIG_MODE=o
export MACOSX_DEPLOYMENT_TARGET=26.0
export WM_PROJECT_USER_DIR="$1/.lmbox-user"
. "$1/etc/bashrc" WM_COMPILER=Clang WM_MPLIB=dummy WM_COMPILE_CONTROL=~openmp WM_PROJECT_USER_DIR="$1/.lmbox-user"
export WM_NCOMPPROCS=6
export FOAM_SIGFPE=false
shift
exec "$@"
"""
    run(["/bin/bash", "--noprofile", "--norc", "-c", script, "lmbox-openfoam", str(BUILD), *command], label)


def prepare():
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        raise RuntimeError("This build profile requires macOS arm64")
    if not SOURCE.is_dir():
        raise RuntimeError("Run scripts/prepare-openfoam-source.py first")
    subprocess.run([sys.executable, "-B", str(ROOT / "scripts/prepare-openfoam-source.py"),
                    "--check"], check=True)
    marker = BUILD / ".lmbox-build-source.json"
    source_identity = {
        "archive": json.loads((ROOT / "runtime/openfoam/source.json").read_text())["sha256"],
        "caseMap": __import__("hashlib").sha256((ROOT / "runtime/openfoam/case-map.json").read_bytes()).hexdigest(),
    }
    if BUILD.exists():
        if not marker.is_file() or json.loads(marker.read_text()) != source_identity:
            raise RuntimeError("Build source differs; preserve it and choose a clean build directory")
    else:
        BUILD.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(SOURCE, BUILD, symlinks=True)
        marker.write_text(json.dumps(source_identity, indent=2) + "\n")
    # On case-insensitive volumes string.H/wchar.H must not shadow C headers.
    # OpenFOAM uses quoted includes for its own headers; system headers use <>.
    patches = {}
    for name in ("c", "c++"):
        rule = BUILD / "wmake/rules/darwin64Clang" / name
        original = (SOURCE / "wmake/rules/darwin64Clang" / name).read_text()
        previous = original.replace(
            "$(LIB_HEADER_DIRS)", "$(patsubst -I%,-iquote%,$(LIB_HEADER_DIRS))"
        )
        # Upstream's -iquote. deliberately precedes all -I paths. Preserve
        # that priority when converting the latter into quote-only paths.
        patched = original.replace(
            "$(LIB_HEADER_DIRS)", "-iquote. $(patsubst -I%,-iquote%,$(LIB_HEADER_DIRS))"
        )
        if rule.read_text() not in (original, previous, patched):
            raise RuntimeError(f"Unexpected local compiler-rule modification: {rule}")
        rule.write_text(patched)
        patches[rule.relative_to(BUILD)] = patched.encode()
    for original in SOURCE.rglob("*"):
        relative = original.relative_to(SOURCE)
        copied = BUILD / relative
        if original.is_symlink():
            if not copied.is_symlink() or copied.readlink() != original.readlink():
                raise RuntimeError(f"Modified build source link: {relative}")
        elif original.is_file():
            expected = patches.get(relative, original.read_bytes())
            if (copied.is_symlink() or not copied.is_file() or copied.read_bytes() != expected
                    or copied.stat().st_mode & 0o777 != original.stat().st_mode & 0o777):
                raise RuntimeError(f"Modified build source: {relative}")
    for copied in BUILD.rglob("*"):
        relative = copied.relative_to(BUILD)
        if relative.parts[0] in ("build", "platforms", ".lmbox-user") or "lnInclude" in relative.parts:
            continue
        if relative.as_posix() in (".lmbox-build-source.json", "META-INFO/build-info"):
            continue
        if relative.as_posix() == "etc/config.sh/prefs.openmpi":
            if copied.read_text() != 'export MPI_ARCH_PATH="$WM_PROJECT_DIR/mpi"\n':
                raise RuntimeError("Unexpected MPI build configuration")
            continue
        if relative.as_posix() == "mpi":
            if not copied.is_symlink() or copied.resolve() != ROOT / ".tools/cfd/deps/openmpi-4.1.8-sdk":
                raise RuntimeError("Unexpected MPI SDK link")
            continue
        if not copied.is_dir() and not (SOURCE / relative).exists():
            raise RuntimeError(f"Unexpected build source: {relative}")


def bootstrap():
    foam(["./wmake/src/Allmake", f"-j{JOBS}"], "wmake-tools")
    foam(["./wmake/wmakeLnIncludeAll", "-update"], "include-links")
    foam(["./src/OSspecific/POSIX/Allwmake", f"-j{JOBS}"], "OSspecific")
    foam(["./wmake/wmake", f"-j{JOBS}", "libso", "src/Pstream/dummy"], "Pstream-dummy")
    foam(["./wmake/wmake", f"-j{JOBS}", "libso", "src/OpenFOAM"], "OpenFOAM")


def core():
    for directory in CORE_LIBRARIES:
        foam(["./wmake/wmake", f"-j{JOBS}", "libso", "src/" + directory], directory)
    for directory in CORE_APPLICATIONS:
        foam(["./wmake/wmake", f"-j{JOBS}", "applications/" + directory], directory)


def cfd():
    # Build only the link closure of the native commands used by CfdOF plus
    # function-object libraries loaded from its generated dictionaries.
    for directory in ("phaseIncompressible", "phaseCompressible"):
        foam(["./wmake/wmakeLnInclude", "-u", "src/TurbulenceModels/" + directory],
             "header-only-" + directory)
    libraries = {}
    make_files = [path for base in ("src", "applications")
                  for path in (BUILD / base).rglob("Make/files")]
    for files in make_files:
        match = re.search(r"(?m)^LIB\s*=\s*\S*/lib(\w+)", files.read_text())
        if not match:
            continue
        name = match.group(1)
        directory = files.parent.parent.relative_to(BUILD)
        if name in ("OSspecific", "Pstream"):
            continue
        if name not in libraries or "dummyThirdParty" in directory.parts:
            libraries[name] = directory
    complete = {"OpenFOAM", "Pstream", "OSspecific"}
    visiting = set()
    order = []

    def dependencies(directory):
        options = BUILD / directory / "Make/options"
        return re.findall(r"(?<![\w])-l(\w+)", options.read_text()) if options.is_file() else []

    def add(name):
        if name in complete or name in visiting:
            return
        if name not in libraries:
            if name in ("z", "m", "dl", "pthread"):
                return
            raise RuntimeError(f"Unresolved native library dependency: {name}")
        visiting.add(name)
        for dependency in dependencies(libraries[name]):
            add(dependency)
        visiting.remove(name)
        complete.add(name)
        order.append(libraries[name])

    for directory in CFD_APPLICATIONS:
        for name in dependencies(Path("applications") / directory):
            add(name)
    for name in ("genericPatchFields", "forces", "sampling", "fieldFunctionObjects",
                 "utilityFunctionObjects", "solverFunctionObjects"):
        add(name)
    for directory in order:
        foam(["./wmake/wmake", f"-j{JOBS}", "libso", str(directory)], str(directory))
    for directory in CFD_APPLICATIONS:
        foam(["./wmake/wmake", f"-j{JOBS}", "applications/" + directory], directory)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=["prepare", "bootstrap", "core", "cfd", "all"], default="all", nargs="?")
    arguments = parser.parse_args()
    prepare()
    if arguments.stage in ("bootstrap", "all"):
        bootstrap()
    if arguments.stage in ("core", "all"):
        core()
    if arguments.stage in ("cfd", "all"):
        cfd()


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        sys.exit(f"OpenFOAM build failed: {error}")
