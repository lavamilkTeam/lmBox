"""Acquire pinned official archives for the private OpenFOAM build."""

import hashlib
from pathlib import Path
from pathlib import PurePosixPath
import subprocess
import tarfile
import tempfile


ROOT = Path(__file__).resolve().parents[2]


def acquire(filename, url, expected_sha256):
    cache = ROOT / ".tools/cfd/downloads"
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / filename
    if not target.is_file():
        with tempfile.NamedTemporaryFile(prefix=filename + ".", suffix=".partial",
                                         dir=cache, delete=False) as temporary:
            partial = Path(temporary.name)
        try:
            subprocess.run(
                ["curl", "--fail", "--location", "--retry", "3",
                 "--output", str(partial), url], check=True,
            )
            if hashlib.sha256(partial.read_bytes()).hexdigest() != expected_sha256:
                raise ValueError(f"Downloaded source checksum differs: {filename}")
            partial.replace(target)
        finally:
            partial.unlink(missing_ok=True)
    if hashlib.sha256(target.read_bytes()).hexdigest() != expected_sha256:
        raise ValueError(f"Cached source checksum differs: {filename}")
    return target


def verify_or_extract(archive, destination):
    """Verify immutable out-of-source inputs, refusing edited or partial trees."""
    existing = destination.exists()
    expected = set()
    with tarfile.open(archive) as source:
        for member in source.getmembers():
            original = PurePosixPath(member.name)
            if original.is_absolute() or ".." in original.parts:
                raise ValueError("Unsafe dependency source path")
            relative = PurePosixPath(*original.parts[1:])
            if str(relative) == ".":
                continue
            expected.add(relative.as_posix())
            target = destination / relative
            for parent in relative.parents:
                if str(parent) != ".":
                    expected.add(parent.as_posix())
            if member.isdir():
                if existing:
                    if target.is_symlink() or not target.is_dir():
                        raise ValueError(f"Changed dependency directory: {relative}")
                else:
                    target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                data = source.extractfile(member).read()
                if existing:
                    if (target.is_symlink() or not target.is_file()
                            or target.read_bytes() != data
                            or target.stat().st_mode & 0o777 != member.mode & 0o777):
                        raise ValueError(f"Changed dependency source: {relative}")
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
                    target.chmod(member.mode & 0o777)
            elif member.issym():
                link = PurePosixPath(member.linkname)
                resolved = (target.parent / link).resolve()
                if link.is_absolute() or destination.resolve() not in resolved.parents:
                    raise ValueError("Dependency link escapes its source directory")
                if existing:
                    if not target.is_symlink() or target.readlink().as_posix() != member.linkname:
                        raise ValueError(f"Changed dependency source link: {relative}")
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.symlink_to(member.linkname)
            else:
                raise ValueError("Unsupported dependency source archive member")
    actual = {path.relative_to(destination).as_posix() for path in destination.rglob("*")}
    if actual != expected:
        raise ValueError("Dependency source tree has missing or unexpected files")
    return destination
