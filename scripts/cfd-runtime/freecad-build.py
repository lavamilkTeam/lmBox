#!/usr/bin/env python3
"""Build the fixed FreeCAD source with only CfdOF's required workbenches."""

import argparse
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess


def main():
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deps", type=Path, default=root / ".tools/cfd/deps/freecad")
    parser.add_argument("--build", type=Path, default=root / ".tools/cfd/build/freecad")
    parser.add_argument("--install", type=Path, default=root / ".tools/cfd/install/freecad-native")
    parser.add_argument("--jobs", type=int, default=2)
    parser.add_argument("--configure-only", action="store_true")
    args = parser.parse_args()
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        parser.error("This build profile currently supports macOS arm64 only.")
    if args.jobs < 1:
        parser.error("--jobs must be positive")
    deps = args.deps.resolve(strict=True)
    python = deps / "bin/python3"
    if not python.is_file():
        parser.error("The dependency prefix must contain Python and development libraries.")
    cmake = shutil.which("cmake")
    ninja = shutil.which("ninja")
    if not cmake or not ninja:
        parser.error("cmake and ninja must be available on PATH")
    env = os.environ.copy()
    env["PATH"] = str(deps / "bin") + os.pathsep + env["PATH"]
    env["PKG_CONFIG_PATH"] = str(deps / "lib/pkgconfig")
    env["CONDA_PREFIX"] = str(deps)
    env["PYTHONNOUSERSITE"] = "1"
    env.pop("PYTHONPATH", None)
    # The upstream fallback only matches one digit per Coin version component.
    # Pass the real header values so 4.0.10 is not misread as 4.0.1.
    coin_header = (deps / "include/Inventor/C/basic.h").read_text()
    coin_version = {
        part: re.search(rf"#define\s+COIN_{part}_VERSION\s+(\d+)", coin_header)[1]
        for part in ("MAJOR", "MINOR", "MICRO")
    }
    command = [
        cmake, "-S", str(root / "runtime/freecad"), "-B", str(args.build),
        "-G", "Ninja", "-C", str(Path(__file__).with_name("freecad-minimal.cmake")),
        "-DCMAKE_PROJECT_FreeCAD_INCLUDE=" + str(Path(__file__).with_name("freecad-compatibility.cmake")),
        f"-DCMAKE_PREFIX_PATH={deps}", f"-DCMAKE_INSTALL_PREFIX={args.install.resolve()}",
        f"-DQT_HOST_PATH={deps}",
        f"-DPython3_EXECUTABLE={python}", f"-DCMAKE_MAKE_PROGRAM={ninja}",
        "-DCMAKE_OSX_ARCHITECTURES=arm64", "-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0",
        "-DCOIN3D_VERSION=" + ".".join(coin_version.values()),
        *(f"-DCOIN3D_{key}_VERSION={value}" for key, value in coin_version.items()),
    ]
    subprocess.run(command, check=True, env=env)
    if not args.configure_only:
        subprocess.run(
            [cmake, "--build", str(args.build), "--parallel", str(args.jobs)],
            check=True, env=env,
        )
        subprocess.run(
            [cmake, "--install", str(args.build), "--prefix", str(args.install.resolve())],
            check=True, env=env,
        )


if __name__ == "__main__":
    main()
