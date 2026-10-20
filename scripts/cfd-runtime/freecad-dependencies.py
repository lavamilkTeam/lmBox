#!/usr/bin/env python3
"""Create the locked, project-private FreeCAD development dependency prefix."""

import argparse
import hashlib
import json
from pathlib import Path
import platform
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request


def repair_signatures(prefix):
    """Conda's prefix relocation invalidates some macOS ad-hoc signatures."""
    repaired = 0
    for path in prefix.rglob("*"):
        if path.is_symlink() or not path.is_file():
            continue
        with path.open("rb") as stream:
            magic = stream.read(4)
        if magic not in (b"\xcf\xfa\xed\xfe", b"\xfe\xed\xfa\xcf", b"\xca\xfe\xba\xbe"):
            continue
        result = subprocess.run(["codesign", "--verify", str(path)], capture_output=True)
        if result.returncode == 0:
            continue
        # Replace the inode as well: macOS can cache the invalid signature.
        staging = path.with_name(path.name + ".lmbox-signing")
        shutil.copy2(path, staging)
        try:
            subprocess.run(
                ["codesign", "--force", "--sign", "-", str(staging)],
                capture_output=True, check=True,
            )
            staging.replace(path)
        finally:
            staging.unlink(missing_ok=True)
        repaired += 1
    return repaired


def main():
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prefix", type=Path, default=root / ".tools/cfd/deps/freecad")
    args = parser.parse_args()
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        parser.error("The dependency lock is for macOS arm64.")
    lock = json.loads(Path(__file__).with_suffix(".json").read_text())
    prefix = args.prefix.resolve()
    expected = {(p["name"], p["version"], p["build"]) for p in lock["packages"]}
    if (prefix / "conda-meta").is_dir():
        actual = set()
        for path in (prefix / "conda-meta").glob("*.json"):
            record = json.loads(path.read_text())
            actual.add((record["name"], record["version"], record["build"]))
        if expected != actual:
            parser.error("Existing dependency prefix differs from the lock; use a new --prefix.")
    else:
        if prefix.exists() and any(prefix.iterdir()):
            parser.error("Refusing to install into a nonempty, unrecognized prefix.")
        toolchain = root / ".tools/cfd/toolchain"
        toolchain.mkdir(parents=True, exist_ok=True)
        archive = toolchain / "micromamba.tar.bz2"
        tool = lock["micromamba"]
        if not archive.is_file():
            with urllib.request.urlopen(tool["url"], timeout=120) as response:
                archive.write_bytes(response.read())
        if hashlib.sha256(archive.read_bytes()).hexdigest() != tool["sha256"]:
            parser.error("micromamba archive checksum differs from the lock.")
        executable = toolchain / "bin/micromamba"
        with tarfile.open(archive) as source:
            member = source.getmember("bin/micromamba")
            if not member.isfile():
                parser.error("micromamba archive lacks its executable.")
            executable.parent.mkdir(parents=True, exist_ok=True)
            executable.write_bytes(source.extractfile(member).read())
            executable.chmod(0o755)
        with tempfile.TemporaryDirectory(prefix="lmbox-freecad-deps-") as temporary:
            explicit = Path(temporary) / "explicit.txt"
            explicit.write_text(
                "@EXPLICIT\n"
                + "\n".join(p["url"] + "#" + p["md5"] for p in lock["packages"])
                + "\n"
            )
            subprocess.run([
                str(executable), "create", "--yes", "--no-rc",
                "--root-prefix", str(root / ".tools/cfd/mamba"),
                "--prefix", str(prefix), "--file", str(explicit),
            ], check=True)
    repaired = repair_signatures(prefix)
    subprocess.run(
        [str(prefix / "bin/python3"), "-c",
         "import PySide6.QtCore, PySide6.QtWidgets, shiboken6, pivy.coin, numpy, matplotlib"],
        check=True,
    )
    print(f"Verified {len(expected)} locked development dependencies; repaired {repaired} signatures.")


if __name__ == "__main__":
    main()
