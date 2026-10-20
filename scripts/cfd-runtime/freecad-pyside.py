#!/usr/bin/env python3
"""Build and validate the upstream PySide 6.8.3 signal-lifetime backport."""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import subprocess
import tarfile
import tempfile


ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
LIBRARY = "libpyside6.cpython-311-darwin.6.8.dylib"
SYSTEM_LIBRARIES = ("/usr/lib/", "/System/Library/")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def acquire(filename, url, sha256, accept=None):
    target = ROOT / ".tools/cfd/downloads" / filename
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as stream:
            temporary = Path(stream.name)
        try:
            command = ["curl", "--fail", "--location", "--retry", "3"]
            if accept:
                command += ["-H", "Accept: " + accept]
            subprocess.run(command + ["--output", str(temporary), url], check=True)
            if digest(temporary) != sha256:
                raise ValueError("Downloaded source checksum differs: " + filename)
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    if digest(target) != sha256:
        raise ValueError("Cached source checksum differs: " + filename)
    return target


def prepare(work, lock):
    archive = acquire(
        "pyside-setup-v6.8.3.tar.gz", lock["sourceUrl"], lock["sourceSha256"]
    )
    patch = acquire(
        "pyside-d580aae.patch",
        lock["patchUrl"],
        lock["patchSha256"],
        lock["patchAccept"],
    )
    sections = patch.read_bytes().split(b"diff --git ")[1:]
    selected = [
        b"diff --git " + section
        for section in sections
        if section.startswith(("a/" + lock["patchFile"] + " ").encode())
    ]
    if len(selected) != 1:
        raise ValueError(
            "The official patch must contain exactly one runtime source diff"
        )
    work.mkdir(parents=True, exist_ok=True)
    source = work / "pyside-setup-6.8.3"
    existing = source.exists()
    expected = set()
    with tarfile.open(archive) as upstream:
        original = upstream.extractfile(
            "pyside-setup-6.8.3/" + lock["patchFile"]
        ).read()
        with tempfile.TemporaryDirectory(prefix="pyside-patch-") as directory:
            before = Path(directory) / "original.cpp"
            after = Path(directory) / "patched.cpp"
            before.write_bytes(original)
            subprocess.run(
                [
                    "/usr/bin/patch",
                    "--batch",
                    "--fuzz=0",
                    "--output",
                    str(after),
                    str(before),
                ],
                input=selected[0],
                check=True,
                stdout=subprocess.PIPE,
            )
            patched = after.read_bytes()
        for member in upstream.getmembers():
            path = PurePosixPath(member.name)
            if path.is_absolute() or ".." in path.parts or path.parts[0] != source.name:
                raise ValueError("Unsafe source archive member")
            relative = path.relative_to(source.name)
            if str(relative) == ".":
                continue
            expected.add(relative.as_posix())
            target = source / relative
            if member.isdir():
                if existing:
                    if target.is_symlink() or not target.is_dir():
                        raise ValueError("Modified source directory: " + str(relative))
                else:
                    target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                data = (
                    patched
                    if str(relative) == lock["patchFile"]
                    else upstream.extractfile(member).read()
                )
                if existing:
                    if (
                        target.is_symlink()
                        or not target.is_file()
                        or target.read_bytes() != data
                        or target.stat().st_mode & 0o777 != member.mode & 0o777
                    ):
                        raise ValueError("Modified source input: " + str(relative))
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
                    target.chmod(member.mode & 0o777)
            elif member.issym():
                link = PurePosixPath(member.linkname)
                resolved = (target.parent / link).resolve()
                if link.is_absolute() or source.resolve() not in resolved.parents:
                    raise ValueError("Source link escapes the verified tree")
                if existing:
                    if (
                        not target.is_symlink()
                        or os.readlink(target) != member.linkname
                    ):
                        raise ValueError("Modified source link: " + str(relative))
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.symlink_to(member.linkname)
            else:
                raise ValueError("Unexpected non-file source member")
    actual = {path.relative_to(source).as_posix() for path in source.rglob("*")}
    if actual != expected:
        raise ValueError("Missing or unexpected source inputs")
    return source, patch


def build(args, lock):
    source, patch = prepare(args.build, lock)
    entry = args.build / "entry"
    entry.mkdir(exist_ok=True)
    shutil.copyfile(HERE / "freecad-pyside.cmake", entry / "CMakeLists.txt")
    cmake, ninja = shutil.which("cmake"), shutil.which("ninja")
    if not cmake or not ninja:
        raise ValueError("CMake and Ninja must be available")
    environment = os.environ.copy()
    for name in (
        "PYTHONPATH",
        "PYTHONHOME",
        "DYLD_LIBRARY_PATH",
        "DYLD_FALLBACK_LIBRARY_PATH",
    ):
        environment.pop(name, None)
    environment["PYTHONNOUSERSITE"] = "1"
    native = args.build / "native"
    subprocess.run(
        [
            cmake,
            "-S",
            str(entry),
            "-B",
            str(native),
            "-G",
            "Ninja",
            "-DCMAKE_MAKE_PROGRAM=" + ninja,
            "-DLMBOX_PYSIDE_SOURCE=" + str(source),
            "-DCMAKE_PREFIX_PATH=" + str(args.deps),
            "-DQT_HOST_PATH=" + str(args.deps),
            "-DPython_EXECUTABLE=" + str(args.deps / "bin/python3"),
            "-DCMAKE_BUILD_TYPE=Release",
            "-DCMAKE_INSTALL_PREFIX=" + str(args.install),
            "-DCMAKE_OSX_ARCHITECTURES=arm64",
            "-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0",
            "-DCMAKE_CXX_COMPILER=/usr/bin/clang++",
            "-DCMAKE_BUILD_WITH_INSTALL_RPATH=ON",
            "-DCMAKE_INSTALL_RPATH=@loader_path",
        ],
        check=True,
        env=environment,
    )
    subprocess.run(
        [
            cmake,
            "--build",
            str(native),
            "--target",
            "pyside6",
            "--parallel",
            str(args.jobs),
        ],
        check=True,
        env=environment,
    )
    args.install.mkdir(parents=True, exist_ok=True)
    libraries = args.install / "lib"
    libraries.mkdir(exist_ok=True)
    output = libraries / LIBRARY
    shutil.copy2(native / "libpyside" / LIBRARY, output)
    architecture = subprocess.check_output(
        ["lipo", "-archs", str(output)], text=True
    ).strip()
    loads = subprocess.check_output(["otool", "-l", str(output)], text=True)
    if architecture != "arm64" or not re.search(r"(?m)^\s*minos 13\.0\s*$", loads):
        raise ValueError("Patched library architecture or minimum macOS differs")
    licenses = args.install / "licenses"
    licenses.mkdir(exist_ok=True)
    shutil.copytree(source / "LICENSES", licenses / "PySide6", dirs_exist_ok=True)
    shutil.copy2(patch, licenses / "PYSIDE-3148.patch")
    manifest = {
        "schemaVersion": 1,
        "component": "pyside-signal-lifetime-patch",
        "target": "darwin-arm64",
        **lock,
        "library": "lib/" + LIBRARY,
        "librarySha256": digest(output),
        "build": {
            "sourceBuilt": True,
            "target": "pyside6",
            "minimumMacOS": "13.0",
            "pythonAbi": "cpython-311-darwin",
            "limitedApi": False,
            "qtVersion": "6.8.3",
            "shibokenVersion": "6.8.3",
            "sdkLockSha256": digest(HERE / "freecad-dependencies.json"),
            "cmakeProfileSha256": digest(HERE / "freecad-pyside.cmake"),
            "patchedFileSha256": digest(source / lock["patchFile"]),
        },
        "smoke": {"status": "not-run", "checks": []},
    }
    (args.install / "runtime-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n"
    )


def relocate_library(path, runtime):
    loads = subprocess.check_output(["otool", "-l", str(path)], text=True)
    edits = []
    for block in re.split(r"\nLoad command \d+\n", loads):
        command = re.search(r"(?m)^\s*cmd (\S+)\s*$", block)
        if not command:
            continue
        kind = command.group(1)
        if kind == "LC_RPATH":
            edits += [
                "-delete_rpath",
                re.search(r"\s+path (.+) \(offset \d+\)", block)[1],
            ]
        elif kind == "LC_ID_DYLIB":
            edits += ["-id", "@rpath/" + LIBRARY]
        elif kind in ("LC_LOAD_DYLIB", "LC_LOAD_WEAK_DYLIB", "LC_REEXPORT_DYLIB"):
            value = re.search(r"\s+name (.+) \(offset \d+\)", block)[1]
            if value.startswith(SYSTEM_LIBRARIES):
                continue
            dependency = runtime / "lib" / Path(value).name
            if not dependency.is_file():
                raise ValueError("Missing runtime dependency: " + dependency.name)
            edits += ["-change", value, "@loader_path/" + dependency.name]
    subprocess.run(
        ["install_name_tool", *edits, str(path)], check=True, capture_output=True
    )
    subprocess.run(
        ["codesign", "--force", "--sign", "-", str(path)],
        check=True,
        capture_output=True,
    )


def smoke(args):
    manifest_path = args.install / "runtime-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    library = args.install / "lib" / LIBRARY
    if digest(library) != manifest["librarySha256"]:
        raise ValueError("The patched library changed after its build receipt")
    manifest["smoke"] = {"status": "not-run", "checks": []}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    environment = {
        "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
        "QT_QPA_PLATFORM": "offscreen",
        "PYTHONNOUSERSITE": "1",
        "PYTHONDONTWRITEBYTECODE": "1",
    }
    with tempfile.TemporaryDirectory(prefix="pyside-patch-smoke-") as temporary:
        root = Path(temporary)
        moved = root / "runtime with spaces"
        shutil.copytree(args.runtime, moved, symlinks=True)
        target = moved / "lib" / LIBRARY
        if target.is_symlink():
            target = target.resolve(strict=True)
        target.relative_to(moved)
        shutil.copy2(library, target)
        relocate_library(target, moved)
        environment["HOME"] = str(root)
        environment["TMPDIR"] = str(root)
        result = subprocess.run(
            [str(moved / "bin/python3"), str(HERE / "freecad-pyside-regression.py")],
            env=environment,
            text=True,
            capture_output=True,
            timeout=30,
        )
        if result.returncode:
            raise RuntimeError(
                f"Public PySide regression failed ({result.returncode}):\n"
                + result.stdout
                + result.stderr
            )
        summary = json.loads(result.stdout)
        if summary.get("status") != "passed":
            raise ValueError("The public PySide regression did not pass")
    manifest["smoke"] = {
        "status": "passed",
        "checks": [summary],
        "relocatedRuntime": True,
        "hostEnvironmentIsolated": True,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest["smoke"], indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "stage", choices=("build", "smoke", "all"), nargs="?", default="all"
    )
    parser.add_argument("--deps", type=Path, default=ROOT / ".tools/cfd/deps/freecad")
    parser.add_argument("--build", type=Path, default=ROOT / ".tools/cfd/build/pyside")
    parser.add_argument(
        "--install", type=Path, default=ROOT / ".tools/cfd/install/pyside-patch"
    )
    parser.add_argument(
        "--runtime", type=Path, default=ROOT / ".tools/cfd/install/freecad"
    )
    parser.add_argument("--jobs", type=int, choices=range(1, 5), default=4)
    args = parser.parse_args()
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        parser.error("This profile requires macOS arm64")
    for name in ("deps", "build", "install", "runtime"):
        setattr(args, name, getattr(args, name).resolve())
    lock = json.loads((HERE / "freecad-pyside-source.json").read_text())
    if args.stage in ("build", "all"):
        build(args, lock)
    if args.stage in ("smoke", "all"):
        smoke(args)


if __name__ == "__main__":
    main()
