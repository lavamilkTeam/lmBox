"""Assemble and verify the compiled CFD runtime; never discover host applications."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parent.parent
COMPONENTS = ("freecad", "paraview", "openfoam")
ENTRIES = {
    "pythonExecutable": "freecad/bin/python3",
    "pvpythonExecutable": "paraview/bin/vtkpython",
    "openfoamDirectory": "openfoam",
}
COMMITS = {
    "freecad": "145529fe741292ff0b3977a01195bf0247425794",
    "paraview": "08f33c1718f5c6a7da86a2f3b4d9fb863cb5be1c",
    "openfoam": "a6e826bd55d5ce93d94d18fbd96c27ee7d90aeeb",
}
MACHO = {
    b"\xcf\xfa\xed\xfe", b"\xce\xfa\xed\xfe", b"\xfe\xed\xfa\xcf", b"\xfe\xed\xfa\xce",
    b"\xca\xfe\xba\xbe", b"\xca\xfe\xba\xbf", b"\xbe\xba\xfe\xca", b"\xbf\xba\xfe\xca",
}
SYSTEM_LIBRARIES = ("/usr/lib/", "/System/Library/")
LOAD_COMMANDS = {
    "LC_LOAD_DYLIB", "LC_LOAD_WEAK_DYLIB", "LC_REEXPORT_DYLIB",
    "LC_LOAD_UPWARD_DYLIB", "LC_LAZY_LOAD_DYLIB", "LC_LOAD_DYLINKER",
}


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def inventory(directory):
    result = {}
    for path in sorted(directory.rglob("*")):
        relative = path.relative_to(directory).as_posix()
        if relative == "bundle.json":
            continue
        if path.is_symlink():
            target = os.readlink(path)
            if os.path.isabs(target):
                raise ValueError(f"Absolute package link: {relative}")
            path.resolve(strict=True).relative_to(directory.resolve())
            result[relative] = {"link": target}
        elif path.is_file():
            result[relative] = {
                "sha256": digest(path), "size": path.stat().st_size,
                "mode": stat.S_IMODE(path.stat().st_mode),
            }
        elif not path.is_dir():
            raise ValueError(f"Unsupported package entry: {relative}")
    return result


def component_fingerprint(directory):
    """Match the smoke artifact fingerprint without including its own manifest."""
    result = hashlib.sha256()
    for path in sorted(directory.rglob("*")):
        if path == directory / "runtime-manifest.json" or (path.is_dir() and not path.is_symlink()):
            continue
        result.update(path.relative_to(directory).as_posix().encode() + b"\0")
        if path.is_symlink():
            result.update(b"link\0" + os.readlink(path).encode())
        else:
            result.update(b"file\0" + str(path.stat().st_mode & 0o777).encode() + b"\0")
            with path.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    result.update(chunk)
        result.update(b"\0")
    return result.hexdigest()


def component_manifests(directory):
    manifests = {}
    for component in COMPONENTS:
        location = directory / component
        manifest = json.loads((location / "runtime-manifest.json").read_text())
        if (not isinstance(manifest, dict) or manifest.get("schemaVersion") != 1
                or manifest.get("component") != component
                or manifest.get("target") != "darwin-arm64"
                or manifest.get("sourceCommit") != COMMITS[component]):
            raise ValueError(f"Unrecognized compiled component: {component}")
        smoke = manifest.get("smoke")
        if (not isinstance(smoke, dict) or smoke.get("status") != "passed"
                or not isinstance(smoke.get("checks"), list) or not smoke["checks"]
                or any(not isinstance(item, str) or not item.strip() for item in smoke["checks"])):
            raise ValueError(f"Component has no passed smoke checks: {component}")
        if ("artifactSha256" in smoke
                and smoke["artifactSha256"] != component_fingerprint(location)):
            raise ValueError(f"Component changed since its smoke checks: {component}")
        manifests[component] = manifest
    return manifests


def check_entries(directory, manifest):
    if manifest.get("schemaVersion") != 1 or manifest.get("target") != "darwin-arm64":
        raise ValueError("Unsupported CFD bundle version or platform")
    if manifest.get("entrypoints") != ENTRIES:
        raise ValueError("CFD bundle entrypoints differ from the supported layout")
    for key, relative in ENTRIES.items():
        path = directory / relative
        expected = path / "etc/bashrc" if key == "openfoamDirectory" else path
        if not expected.is_file():
            raise ValueError(f"Missing CFD entrypoint: {relative}")
        expected.resolve().relative_to(directory.resolve())
        if key != "openfoamDirectory" and not os.access(path, os.X_OK):
            raise ValueError(f"CFD entrypoint is not executable: {relative}")


def audit_macho(directory):
    """Resolve every non-system load command through this package's own paths."""
    if platform.system() != "Darwin":
        raise ValueError("Mach-O dependency auditing requires macOS")
    count = 0
    minimum_versions = []
    for path in sorted(directory.rglob("*")):
        if path.is_symlink() or not path.is_file():
            continue
        with path.open("rb") as stream:
            header = stream.read(16)
            if header[:4] not in MACHO:
                continue
        architectures = subprocess.check_output(["lipo", "-archs", str(path)], text=True).split()
        if architectures != ["arm64"]:
            raise ValueError(f"Expected arm64-only Mach-O: {path.relative_to(directory)}")
        # arm64 thin Mach-O has a little-endian header; MH_EXECUTE is 2.
        executable = int.from_bytes(header[12:16], "little") == 2
        commands = subprocess.check_output(["otool", "-l", str(path)], text=True)
        loads, search_paths = [], []

        def local_path(value):
            if value == "@loader_path":
                candidate = path.parent
            elif value.startswith("@loader_path/"):
                candidate = path.parent / value.removeprefix("@loader_path/")
            elif executable and value == "@executable_path":
                candidate = path.parent
            elif executable and value.startswith("@executable_path/"):
                candidate = path.parent / value.removeprefix("@executable_path/")
            else:
                raise ValueError(f"Unsupported runtime path in {path.relative_to(directory)}: {value}")
            candidate = candidate.resolve(strict=True)
            candidate.relative_to(directory.resolve())
            return candidate

        for block in re.split(r"\nLoad command \d+\n", commands):
            command = re.search(r"(?m)^\s*cmd (\S+)\s*$", block)
            if not command:
                continue
            kind = command.group(1)
            if kind in ("LC_BUILD_VERSION", "LC_VERSION_MIN_MACOSX"):
                if kind == "LC_BUILD_VERSION":
                    native_platform = re.search(r"(?m)^\s*platform (\S+)\s*$", block)
                    if not native_platform or native_platform.group(1) not in ("1", "macos"):
                        raise ValueError(f"Expected macOS Mach-O: {path.relative_to(directory)}")
                version = re.search(
                    r"(?m)^\s*(?:minos|version) (\d+(?:\.\d+){0,2})\s*$", block
                )
                if not version:
                    raise ValueError(f"Missing minimum macOS version: {path.relative_to(directory)}")
                parts = [int(part) for part in version.group(1).split(".")]
                minimum_versions.append(tuple(parts + [0] * (3 - len(parts))))
            elif kind == "LC_RPATH":
                value = re.search(r"(?m)^\s*path (.+) \(offset \d+\)$", block)
                if not value:
                    raise ValueError(f"Malformed LC_RPATH: {path.relative_to(directory)}")
                candidate = local_path(value.group(1))
                if not candidate.is_dir():
                    raise ValueError(f"LC_RPATH is not a directory: {path.relative_to(directory)}")
                search_paths.append(candidate)
            elif kind in LOAD_COMMANDS or kind == "LC_ID_DYLIB":
                value = re.search(r"(?m)^\s*name (.+) \(offset \d+\)$", block)
                if not value:
                    raise ValueError(f"Malformed library command: {path.relative_to(directory)}")
                if kind == "LC_ID_DYLIB":
                    if not value.group(1).startswith(("@rpath/", "@loader_path/")):
                        raise ValueError(f"Non-relative library ID: {path.relative_to(directory)}")
                else:
                    loads.append(value.group(1))
        for dependency in loads:
            if dependency.startswith(SYSTEM_LIBRARIES) and os.path.normpath(dependency).startswith(SYSTEM_LIBRARIES):
                continue
            if dependency.startswith("@rpath/"):
                suffix = dependency.removeprefix("@rpath/")
                candidates = [candidate / suffix for candidate in search_paths]
                resolved = set()
                for candidate in candidates:
                    candidate.resolve().relative_to(directory.resolve())
                    if candidate.is_file():
                        resolved.add(candidate.resolve(strict=True))
                if len(resolved) != 1:
                    raise ValueError(f"Unresolved or ambiguous @rpath in {path.relative_to(directory)}: {dependency}")
                candidate = resolved.pop()
            else:
                candidate = local_path(dependency)
            if not candidate.is_file():
                raise ValueError(f"Library path is not a file: {path.relative_to(directory)}: {dependency}")
            with candidate.open("rb") as stream:
                if stream.read(4) not in MACHO:
                    raise ValueError(f"Library path is not Mach-O: {path.relative_to(directory)}: {dependency}")
        count += 1
    if not count:
        raise ValueError("CFD bundle contains no compiled Mach-O code")
    if not minimum_versions:
        raise ValueError("CFD bundle does not identify its minimum macOS version")
    major, minor, patch = max(minimum_versions)
    version = f"{major}.{minor}" + (f".{patch}" if patch else "")
    return {"machOFiles": count, "minimumMacOS": version}


def check(directory):
    manifest_path = directory / "bundle.json"
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise ValueError("Bundle manifest must be a regular file")
    manifest = json.loads(manifest_path.read_text())
    if not isinstance(manifest, dict) or not isinstance(manifest.get("files"), dict):
        raise ValueError("Malformed CFD bundle manifest")
    check_entries(directory, manifest)
    if component_manifests(directory) != manifest.get("components"):
        raise ValueError("Bundle component provenance differs from its component manifests")
    actual = inventory(directory)
    if actual != manifest["files"]:
        changed = sorted(key for key in actual.keys() | manifest["files"].keys()
                         if actual.get(key) != manifest["files"].get(key))
        raise ValueError(f"CFD bundle files were changed: {changed[:5]}")
    audit = audit_macho(directory)
    if manifest.get("minimumMacOS") != audit["minimumMacOS"]:
        raise ValueError("Declared minimum macOS differs from compiled runtime requirements")
    print(json.dumps({"files": len(actual), **audit}))
    return manifest


def assemble(install, output):
    if output.exists() or output.is_symlink():
        raise ValueError("Output already exists; choose a new directory to preserve local changes")
    output.parent.mkdir(parents=True, exist_ok=True)
    manifests = component_manifests(install)
    with tempfile.TemporaryDirectory(prefix=".cfd-bundle-", dir=output.parent) as temporary:
        stage = Path(temporary) / "bundle"
        stage.mkdir()
        for component in COMPONENTS:
            shutil.copytree(install / component, stage / component, symlinks=True)
        if component_manifests(stage) != manifests:
            raise ValueError("Component manifests changed during bundle assembly")
        manifest = {
            "schemaVersion": 1, "target": "darwin-arm64",
            "entrypoints": ENTRIES, "components": manifests,
        }
        check_entries(stage, manifest)
        manifest["files"] = inventory(stage)
        manifest["minimumMacOS"] = audit_macho(stage)["minimumMacOS"]
        (stage / "bundle.json").write_text(json.dumps(manifest, indent=2) + "\n")
        stage.rename(output)
    print(f"Prepared {len(manifest['files'])} files in {output}")


def archive(directory, output):
    if output.suffix.lower() != ".zip":
        raise ValueError("CFD archive output must have a .zip suffix")
    receipt_path = output.with_suffix(".json")
    if output.exists() or output.is_symlink() or receipt_path.exists() or receipt_path.is_symlink():
        raise ValueError("Archive already exists; choose a new path")
    if directory.resolve() in output.resolve().parents:
        raise ValueError("Archive output must be outside the bundle directory")
    manifest = check(directory)
    bundle_manifest = directory / "bundle.json"
    manifest_bytes = bundle_manifest.read_bytes()
    if json.loads(manifest_bytes) != manifest:
        raise ValueError("Bundle manifest changed during archive validation")
    expected = dict(manifest["files"])
    expected["bundle.json"] = {
        "sha256": hashlib.sha256(manifest_bytes).hexdigest(), "size": len(manifest_bytes),
        "mode": stat.S_IMODE(bundle_manifest.stat().st_mode),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".cfd-archive-", dir=output.parent) as temporary:
        staged = Path(temporary) / output.name
        subprocess.run([sys.executable, str(ROOT / "scripts/module-archive.py"),
                        str(directory), str(staged)], check=True)
        actual = {}
        with zipfile.ZipFile(staged) as packed:
            for member in packed.infolist():
                if member.filename in actual or member.is_dir():
                    raise ValueError("Unexpected duplicate or directory entry in archive")
                mode = member.external_attr >> 16
                if stat.S_ISLNK(mode):
                    actual[member.filename] = {"link": packed.read(member).decode()}
                else:
                    checksum = hashlib.sha256()
                    with packed.open(member) as stream:
                        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                            checksum.update(chunk)
                    actual[member.filename] = {
                        "sha256": checksum.hexdigest(), "size": member.file_size,
                        "mode": stat.S_IMODE(mode),
                    }
        if actual != expected:
            raise ValueError("Archived content differs from the verified bundle")
        receipt = {
            "schemaVersion": 1, "target": manifest["target"], "archive": output.name,
            "minimumMacOS": manifest["minimumMacOS"],
            "sha256": digest(staged), "size": staged.stat().st_size,
            "sourceCommits": {name: value["sourceCommit"] for name, value in manifest["components"].items()},
        }
        staged_receipt = Path(temporary) / receipt_path.name
        staged_receipt.write_text(json.dumps(receipt, indent=2) + "\n")
        # Hard links publish without overwriting a destination created after validation.
        os.link(staged, output)
        try:
            os.link(staged_receipt, receipt_path)
        except OSError:
            output.unlink()
            raise
    print(json.dumps(receipt))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    prepare = sub.add_parser("assemble")
    prepare.add_argument("--install", type=Path, default=ROOT / ".tools/cfd/install")
    prepare.add_argument("--output", type=Path, default=ROOT / ".tools/cfd/bundle")
    verify = sub.add_parser("check")
    verify.add_argument("bundle", type=Path)
    pack = sub.add_parser("archive")
    pack.add_argument("bundle", type=Path)
    pack.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "assemble":
            assemble(args.install.resolve(), args.output.absolute())
        elif args.command == "check":
            check(args.bundle.resolve())
        else:
            archive(args.bundle.resolve(), args.output.absolute())
    except (OSError, ValueError, KeyError, RuntimeError, zipfile.BadZipFile,
            subprocess.CalledProcessError) as error:
        parser.exit(1, f"CFD runtime packaging failed: {error}\n")


if __name__ == "__main__":
    main()
