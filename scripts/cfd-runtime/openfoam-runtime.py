"""Build, install, or verify the pinned native OpenFOAM runtime profile."""

import argparse
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).resolve().parent


def run(name, *arguments):
    subprocess.run([sys.executable, "-B", str(SCRIPTS / name), *arguments],
                   cwd=ROOT, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=("all", "build", "install", "verify"), default="all", nargs="?")
    args = parser.parse_args()
    if args.stage in ("all", "build"):
        subprocess.run([sys.executable, "-B", str(ROOT / "scripts/prepare-openfoam-source.py")],
                       cwd=ROOT, check=True)
        run("openfoam-build.py", "all")
        run("openfoam-openmp.py")
        run("openfoam-extensions.py", "cfmesh-cfdof", "--jobs", "6")
        run("openfoam-extensions.py", "hisa-master", "--jobs", "6")
        run("openfoam-mpi.py", "all", "--jobs", "2")
        run("openfoam-parallel.py")
    if args.stage in ("all", "install"):
        run("openfoam-install.py")
    if args.stage == "verify":
        run("openfoam-install.py", "--verify-existing")


if __name__ == "__main__":
    main()
