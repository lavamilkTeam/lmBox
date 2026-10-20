"""Build Scotch and OpenFOAM adapters against the private Open MPI SDK."""

import json
from pathlib import Path
import shutil
import subprocess
from openfoam_sources import acquire, verify_or_extract


ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / ".tools/cfd/build"
FOAM = BUILD / "openfoam"
SOURCES = BUILD / "openfoam-dependency-sources"
PREFIX = BUILD / "openfoam-dependencies"
ARCHIVES = {
    "scotch": ("scotch-v7.0.6.tar.gz", "b44acd0d2f53de4b578fa3a88944cccc45c4d2961cd8cefa9b9a1d5431de8e2b"),
}


def command(arguments, name, cwd=None):
    log = BUILD / "openfoam-logs" / (name + ".log")
    print(f"[OpenFOAM parallel] {name}", flush=True)
    with log.open("w") as output:
        subprocess.run(arguments, cwd=cwd, check=True, stdout=output, stderr=subprocess.STDOUT)


def prepare(name):
    filename, digest = ARCHIVES[name]
    archive = acquire(filename,
        "https://gitlab.inria.fr/scotch/scotch/-/archive/v7.0.6/scotch-v7.0.6.tar.gz",
        digest)
    return verify_or_extract(archive, SOURCES / name)


def bison():
    archive = acquire("bison-3.8.2.tar.xz",
        "https://ftp.gnu.org/gnu/bison/bison-3.8.2.tar.xz",
        "9bba0214ccf7f1079c5d59210045227bcf619519840ebfa80cd3849cff5a5bf2")
    source = verify_or_extract(archive, SOURCES / "bison-3.8.2")
    directory = BUILD / "openfoam-bison"
    prefix = PREFIX / "bison"
    directory.mkdir(parents=True, exist_ok=True)
    if not (prefix / "bin/bison").is_file():
        command([str(source / "configure"), "--prefix=" + str(prefix),
                 "--disable-nls"], "bison-configure", directory)
        command(["make", "-j6"], "bison-build", directory)
        command(["make", "install"], "bison-install", directory)
    return prefix / "bin/bison"


def main():
    mpi_prefix = ROOT / ".tools/cfd/deps/openmpi-4.1.8-sdk"
    if not (mpi_prefix / "bin/mpicc").is_file():
        raise RuntimeError("Build the private MPI SDK with openfoam-mpi.py first")
    mpi_manifest = json.loads((mpi_prefix / "lmbox-mpi.json").read_text())
    if mpi_manifest.get("smoke", {}).get("status") != "passed":
        raise RuntimeError("The MPI SDK must pass its own relocation and two-rank smoke first")
    scotch_source = prepare("scotch")
    parser_generator = bison()
    scotch_build = BUILD / "openfoam-scotch"
    scotch_prefix = PREFIX / "scotch"
    cmake = shutil.which("cmake")
    if not cmake:
        raise RuntimeError("CMake is required for Scotch")
    command([
        cmake, "-S", str(scotch_source), "-B", str(scotch_build), "-G", "Ninja",
        "-DCMAKE_BUILD_TYPE=Release", "-DCMAKE_INSTALL_PREFIX=" + str(scotch_prefix),
        "-DCMAKE_OSX_ARCHITECTURES=arm64", "-DBUILD_SHARED_LIBS=ON",
        "-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0",
        "-DBISON_EXECUTABLE=" + str(parser_generator),
        "-DTHREADS=OFF", "-DMPI_THREAD_MULTIPLE=OFF",
        "-DBUILD_FORTRAN=OFF", "-DBUILD_PTSCOTCH=ON", "-DINTSIZE=32",
        "-DBUILD_LIBESMUMPS=OFF", "-DBUILD_LIBSCOTCHMETIS=OFF",
        "-DENABLE_TESTS=OFF", "-DUSE_ZLIB=OFF", "-DUSE_LZMA=OFF", "-DUSE_BZ2=OFF",
        "-DMPI_C_COMPILER=" + str(mpi_prefix / "bin/mpicc"),
    ], "scotch-configure")
    command([cmake, "--build", str(scotch_build), "--parallel", "6"], "scotch-build")
    command([cmake, "--install", str(scotch_build)], "scotch-install")
    # OpenFOAM's MPI setup reads this file after resetting MPI_ARCH_PATH.
    prefs = FOAM / "etc/config.sh/prefs.openmpi"
    prefs.write_text('export MPI_ARCH_PATH="$WM_PROJECT_DIR/mpi"\n')
    link = FOAM / "mpi"
    if not link.exists():
        link.symlink_to(mpi_prefix)
    script = """
export FOAM_CONFIG_MODE=o
. "$1/etc/bashrc" WM_COMPILER=Clang WM_MPLIB=OPENMPI-4.1.8 WM_PROJECT_USER_DIR="$1/.lmbox-user"
export SCOTCH_INC_DIR="$2/include" SCOTCH_LIB_DIR="$2/lib"
export PTSCOTCH_INC_DIR="$2/include" PTSCOTCH_LIB_DIR="$2/lib"
export FOAM_EXTRA_CXXFLAGS="-isystem $MPI_ARCH_PATH/include"
shift 2
exec "$@"
"""
    for target in ("src/Pstream/mpi", "src/parallel/decompose/scotchDecomp",
                   "src/parallel/decompose/ptscotchDecomp"):
        command([
            "/bin/bash", "--noprofile", "--norc", "-c", script, "lmbox-openfoam-parallel",
            str(FOAM), str(scotch_prefix), str(FOAM / "wmake/wmake"),
            "-j6", "libso", str(FOAM / target),
        ], target.replace("/", "-"))
    (PREFIX / "parallel-source.json").write_text(json.dumps({
        "openmpi": mpi_manifest["source"],
        "scotch": {"version": "7.0.6", "url": "https://gitlab.inria.fr/scotch/scotch/-/archive/v7.0.6/scotch-v7.0.6.tar.gz"},
        "archiveSha256": {filename: digest for filename, digest in ARCHIVES.values()},
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
