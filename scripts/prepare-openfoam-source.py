"""Materialize the pinned OpenFOAM source with case-safe paths and references."""

import argparse
from collections import defaultdict
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import posixpath
import re
import tarfile
import tempfile


ROOT = Path(__file__).resolve().parent.parent
CODE_SUFFIXES = {".c", ".h", ".cc", ".hh", ".cpp", ".hpp", ".cxx", ".hxx", ".tcc", ".tpp", ".txx"}
TOKEN = re.compile(rb"[A-Za-z0-9_.$(){}+@-]+(?:/[A-Za-z0-9_.$(){}+@-]+)*")
VARIABLE = re.compile(r"\$\((\w+)\)|\$\{(\w+)\}|\$(\w+)")
PDR_RUN = "tutorials/combustion/PDRFoam/flamePropagationWithObstacles/Allrun"
PDR_RESTORE = b"""
# The solver requires two distinct runtime fields named B and b.
if [ -e 0.orig/b1.gz ]; then
    echo "This tutorial requires a case-sensitive case directory for fields B and b." >&2
    exit 1
fi
restore0Dir || exit 1
mv 0/B1.gz 0/B.gz || exit 1
mv 0/b0.gz 0/b.gz || exit 1
"""


def numbered_pair(names, is_directory=False):
    """Number the side with uppercase at differing positions 1, the other 0."""
    names = sorted(names)
    if len(names) != 2:
        raise ValueError(f"Expected a pair of case variants: {names}")
    first, second = names
    differences = [(a, b) for a, b in zip(first, second) if a != b]
    if not differences or not all(a.isupper() and b.islower() for a, b in differences):
        raise ValueError(f"Case variants have no consistent uppercase side: {names}")
    result = {}
    for name, digit in ((first, "1"), (second, "0")):
        suffix = "" if is_directory else PurePosixPath(name).suffix
        stem = name[:-len(suffix)] if suffix else name
        result[name] = stem + digit + suffix
    return result


class SourcePaths:
    def __init__(self, members, build_outputs):
        self.files = {name for name, member in members.items() if not member.isdir()}
        self.nodes = set(members)
        for name in list(self.nodes):
            self.nodes.update(str(p) for p in PurePosixPath(name).parents if str(p) != ".")
        siblings = defaultdict(set)
        basenames = defaultdict(set)
        for name in self.nodes:
            path = PurePosixPath(name)
            siblings[(str(path.parent), path.name.casefold())].add(path.name)
            if name in self.files and path.suffix.lower() in CODE_SUFFIXES:
                basenames[path.name.casefold()].add(path.name)
        self.entries = {}
        self.filenames = {}
        self.outputs = {}
        self.collision_groups = 0
        for (parent, _), names in sorted(siblings.items()):
            if len(names) > 1:
                self.collision_groups += 1
                for old, new in numbered_pair(
                    names, posixpath.normpath(posixpath.join(parent, next(iter(names)))) not in self.files
                ).items():
                    self.entries[posixpath.normpath(posixpath.join(parent, old))] = new
        for names in basenames.values():
            if len(names) > 1:
                self.filenames.update(numbered_pair(names))
        targets = defaultdict(set)
        for target in build_outputs:
            targets[target.casefold()].add(target)
        for variants in targets.values():
            if len(variants) > 1:
                renames = numbered_pair({posixpath.basename(path) for path in variants})
                for path in variants:
                    self.outputs[path] = posixpath.join(posixpath.dirname(path), renames[posixpath.basename(path)])
        mapped_outputs = [self.outputs.get(path, path).casefold() for path in set(build_outputs)]
        if len(set(mapped_outputs)) != len(mapped_outputs):
            raise ValueError("Unresolved build output collision")
        self.mapped = {name: self.map(name) for name in self.nodes}
        folded = {}
        for old, new in self.mapped.items():
            if new.casefold() in folded:
                raise ValueError(f"Unresolved path collision: {old}, {folded[new.casefold()]}")
            folded[new.casefold()] = old
        # A suffix is usable only if every occurrence has the same translation.
        candidates = {}
        ambiguous = set()
        for old, new in self.mapped.items():
            parts, target = old.split("/"), new.split("/")
            for index in range(len(parts) - 1):
                suffix, translated = "/".join(parts[index:]), "/".join(target[index:])
                if suffix in candidates and candidates[suffix] != translated:
                    ambiguous.add(suffix)
                candidates[suffix] = translated
        self.suffixes = {
            old: new for old, new in candidates.items()
            if old != new and old not in ambiguous
        }

    def map(self, name):
        parts = name.split("/")
        result = [self.entries.get("/".join(parts[:i + 1]), part) for i, part in enumerate(parts)]
        if name in self.files:
            result[-1] = self.filenames.get(parts[-1], result[-1])
        return "/".join(result)

    def link(self, name, target):
        original = posixpath.normpath(posixpath.join(posixpath.dirname(name), target))
        if target.startswith("/") or original == ".." or original.startswith("../"):
            raise ValueError(f"Source link escapes the archive: {name}")
        return posixpath.relpath(self.map(original), posixpath.dirname(self.map(name)) or ".")

    def rewrite(self, name, data):
        filename = PurePosixPath(name).name
        if filename.lower().startswith(("readme", "license", "copying", "copyright")):
            return data
        if b"\0" in data or data.startswith(b"\x1f\x8b"):
            return data
        context = posixpath.dirname(name)
        make_file = PurePosixPath(context).name == "Make"
        if make_file:
            context = posixpath.dirname(context)
        shell_file = data.startswith(b"#!") or filename.startswith(("Allw", "Allrun", "Allclean"))
        variables = {
            "GENERAL_RULES": "@ROOT@/wmake/rules/General",
            "WM_PROJECT_DIR": "@ROOT@",
            "FOAM_SRC": "@ROOT@/src",
        }
        if make_file:
            for key, value in re.findall(rb"(?m)^(\w+)\s*[:?]?=\s*([^\s#]+)\s*$", data):
                variables[key.decode()] = value.decode("ascii", errors="replace")

        def replace(match):
            token = match.group().decode("ascii")
            if token in self.outputs:
                return self.outputs[token].encode()
            # Bare C++ identifiers and type names must not be renamed.
            if "/" not in token and PurePosixPath(token).suffix.lower() not in CODE_SUFFIXES:
                if not (make_file or shell_file):
                    return match.group()
            expanded = token
            for _ in range(12):
                updated = VARIABLE.sub(
                    lambda m: variables.get(next(v for v in m.groups() if v), m.group()), expanded
                )
                if updated == expanded:
                    break
                expanded = updated
            if "$" not in expanded:
                target = posixpath.normpath(
                    expanded[len("@ROOT@/"):] if expanded.startswith("@ROOT@/")
                    else posixpath.join(context, expanded)
                )
                if target in self.mapped:
                    if "$" not in token:
                        translated = posixpath.relpath(self.mapped[target], self.map(context) or ".")
                        # Preserve relative spelling when no translation is needed.
                        if self.mapped[target] == target and self.map(context) == context:
                            return match.group()
                        return translated.encode()
                    parts = token.split("/")
                    tail = 0
                    for part in reversed(parts):
                        if "$" in part:
                            break
                        tail += 1
                    if tail:
                        parts[-tail:] = self.mapped[target].split("/")[-tail:]
                        return "/".join(parts).encode()
            parts = token.split("/")
            for index in range(len(parts) - 1):
                suffix = "/".join(parts[index:])
                if suffix in self.suffixes:
                    parts[index:] = self.suffixes[suffix].split("/")
                    break
            # Exact source filenames are globally consistent, including lnInclude.
            parts[-1] = self.filenames.get(parts[-1], parts[-1])
            return "/".join(parts).encode()

        result = TOKEN.sub(replace, data)
        if name == PDR_RUN:
            if result.count(b"\nrestore0Dir\n") != 1:
                raise ValueError("PDR tutorial restore sequence differs from the supported source")
            result = result.replace(b"\nrestore0Dir\n", PDR_RESTORE)
        return result


def materialize(metadata_path, check=False):
    metadata = json.loads(metadata_path.read_text())
    archive_path = metadata_path.parent / metadata["archive"]
    if hashlib.sha256(archive_path.read_bytes()).hexdigest() != metadata["sha256"]:
        raise ValueError("OpenFOAM source archive SHA-256 mismatch")
    output = metadata_path.parent / "source"
    checking = check or output.exists()
    if check and not output.is_dir():
        raise ValueError("Source is missing; run preparation first")
    with tarfile.open(archive_path, "r:gz") as archive:
        members = {}
        for member in archive.getmembers():
            if member.isdir() and member.name.rstrip("/") == metadata["prefix"].rstrip("/"):
                continue
            if not member.name.startswith(metadata["prefix"]):
                raise ValueError(f"Unexpected archive prefix: {member.name}")
            name = member.name[len(metadata["prefix"]):].rstrip("/")
            if not name:
                continue
            if name.startswith("/") or ".." in PurePosixPath(name).parts or name in members:
                raise ValueError(f"Unsafe or duplicate archive path: {name}")
            if not (member.isfile() or member.isdir() or member.issym()):
                raise ValueError(f"Unsupported archive entry: {name}")
            members[name] = member
        build_outputs = []
        for name, member in members.items():
            if name.endswith("/Make/files") and member.isfile():
                build_outputs.extend(value.decode("ascii") for value in re.findall(
                    rb"(?m)^(?:EXE|LIB)\s*=\s*([^\s#]+)", archive.extractfile(member).read()
                ))
        paths = SourcePaths(members, build_outputs)
        changed = []
        with tempfile.TemporaryDirectory(prefix=".source-stage-", dir=metadata_path.parent) as temporary:
            stage = Path(temporary) / "source"
            if not checking:
                stage.mkdir()
            for name, member in sorted(members.items()):
                mapped = paths.map(name)
                target = (output if checking else stage) / mapped
                if member.isdir():
                    if not checking:
                        target.mkdir(parents=True, exist_ok=True)
                    continue
                if member.issym():
                    link = paths.link(name, member.linkname)
                    if checking:
                        if not target.is_symlink() or os.readlink(target) != link:
                            raise ValueError(f"Modified or missing symlink: {mapped}")
                    else:
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.symlink_to(link)
                    continue
                original = archive.extractfile(member).read()
                data = paths.rewrite(name, original)
                if data != original:
                    changed.append(mapped)
                if checking:
                    if not target.is_file() or target.is_symlink() or target.read_bytes() != data:
                        raise ValueError(f"Modified or missing source file: {mapped}")
                    if (target.stat().st_mode & 0o777) != (member.mode & 0o777):
                        raise ValueError(f"Modified source mode: {mapped}")
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
                    target.chmod(member.mode & 0o777)
            report = {
                "schemaVersion": 1,
                "sourceCommit": metadata["commit"],
                "archiveSha256": metadata["sha256"],
                "siblingCollisionGroups": paths.collision_groups,
                "filenameRenames": dict(sorted(paths.filenames.items())),
                "buildTargetRenames": dict(sorted(paths.outputs.items())),
                "pathRenames": {old: new for old, new in sorted(paths.mapped.items()) if old != new},
                "referenceModifiedFiles": changed,
                "sourceFileCount": len(paths.files),
            }
            report_text = json.dumps(report, indent=2) + "\n"
            report_path = metadata_path.parent / "case-map.json"
            if checking:
                if not report_path.is_file() or report_path.read_text() != report_text:
                    raise ValueError("Case-map differs from the pinned source transformation")
                actual = {str(p.relative_to(output)) for p in output.rglob("*") if p.is_symlink() or p.is_file()}
                expected = {paths.map(name) for name in paths.files}
                if actual != expected:
                    raise ValueError(f"Unexpected source paths: {sorted(actual - expected)[:5]}")
            else:
                stage.rename(output)
                report_path.write_text(report_text)
    print(f"{'Verified' if checking else 'Prepared'} {len(paths.files)} source files; "
          f"{paths.collision_groups} sibling collision groups; "
          f"{len(paths.filenames)} source filename variants; {len(changed)} files with updated references.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", type=Path, default=ROOT / "runtime/openfoam/source.json")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        materialize(args.metadata.resolve(), args.check)
    except (ValueError, OSError, tarfile.TarError) as error:
        parser.exit(1, f"OpenFOAM source preparation failed: {error}\n")
