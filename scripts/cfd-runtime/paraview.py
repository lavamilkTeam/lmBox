"""Build ParaView's pinned VTK reader/filter runtime for CFD extraction."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess

from paraview_bundle import bundle, inspect_bundle, smoke


ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / ".tools/cfd/build/paraview/vtk"
INSTALL = ROOT / ".tools/cfd/install/paraview"


def source_identity():
    def commit(directory):
        if subprocess.run(
            ["git", "-C", str(directory), "diff", "--quiet", "HEAD", "--"],
            check=False,
        ).returncode:
            raise RuntimeError(f"Build provenance requires clean pinned source: {directory.name}")
        return subprocess.check_output(
            ["git", "-C", str(directory), "rev-parse", "HEAD"], text=True
        ).strip()

    return {
        "paraview": {"version": "6.1.0", "commit": commit(ROOT / "runtime/paraview")},
        "vtk": {"commit": commit(ROOT / "runtime/paraview/VTK")},
        "presetSha256": hashlib.sha256(Path(__file__).with_suffix(".cmake").read_bytes()).hexdigest(),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("configure", "build", "install", "audit", "smoke"))
    parser.add_argument("--python", default="python3.12")
    parser.add_argument("--jobs", type=int, default=4, choices=(1, 2, 3, 4))
    parser.add_argument("--case", type=Path)
    parser.add_argument("--time", type=float, default=1500)
    args = parser.parse_args()
    if args.action == "configure":
        interpreter = subprocess.check_output(
            [args.python, "-c", "import sys; print(sys.executable)"], text=True
        ).strip()
        command = [
            "cmake", "-S", str(ROOT / "runtime/paraview/VTK"), "-B", str(BUILD),
            "-G", "Ninja", "-C", str(Path(__file__).with_suffix(".cmake")),
            f"-DCMAKE_INSTALL_PREFIX={INSTALL}", f"-DPython3_EXECUTABLE={interpreter}",
        ]
        subprocess.run(command, check=True, cwd=ROOT)
        (BUILD / "lmbox-configure.json").write_text(json.dumps({
            "source": source_identity(), "pythonExecutable": interpreter,
        }, indent=2) + "\n")
    elif args.action == "build":
        subprocess.run(
            ["cmake", "--build", str(BUILD), "--parallel", str(args.jobs)], check=True, cwd=ROOT
        )
        configured = json.loads((BUILD / "lmbox-configure.json").read_text())
        if configured["source"] != source_identity():
            raise RuntimeError("Source or preset changed; configure and build again.")
        (BUILD / "lmbox-build.json").write_text(json.dumps(configured, indent=2) + "\n")
    elif args.action == "install":
        built = json.loads((BUILD / "lmbox-build.json").read_text())
        if built["source"] != source_identity():
            raise RuntimeError("Source or preset changed since the successful build.")
        subprocess.run(["cmake", "--install", str(BUILD), "--strip"], check=True, cwd=ROOT)
        bundle(INSTALL, built["pythonExecutable"], built["source"], ROOT)
    elif args.action == "audit":
        print(json.dumps(inspect_bundle(INSTALL), indent=2))
    else:
        smoke(INSTALL, ROOT, args.case, args.time)


if __name__ == "__main__":
    main()
