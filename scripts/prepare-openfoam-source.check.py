"""Exercise source preparation through its public CLI using small archives."""

import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest


PREPARE = Path(__file__).resolve().with_name("prepare-openfoam-source.py")
PREFIX = "OpenFOAM-fixture/"
COMMIT = "1234567890abcdef1234567890abcdef12345678"


class SourcePreparationCheck(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="lmbox-openfoam-check-")
        self.addCleanup(self.temporary.cleanup)
        self.workspace = Path(self.temporary.name)

    def fixture(self, files, *, symlinks=None, modes=None, directory="runtime"):
        root = self.workspace / directory
        root.mkdir()
        archive_path = root / "OpenFOAM-fixture.tar.gz"
        with tarfile.open(archive_path, "w:gz") as archive:
            for name, contents in files.items():
                data = contents.encode() if isinstance(contents, str) else contents
                member = tarfile.TarInfo(PREFIX + name)
                member.size = len(data)
                member.mode = (modes or {}).get(name, 0o644)
                archive.addfile(member, io.BytesIO(data))
            for name, target in (symlinks or {}).items():
                member = tarfile.TarInfo(PREFIX + name)
                member.type = tarfile.SYMTYPE
                member.linkname = target
                member.mode = 0o777
                archive.addfile(member)
        metadata = {
            "archive": archive_path.name,
            "sha256": hashlib.sha256(archive_path.read_bytes()).hexdigest(),
            "prefix": PREFIX,
            "commit": COMMIT,
        }
        metadata_path = root / "source.json"
        metadata_path.write_text(json.dumps(metadata))
        return metadata_path

    def run_prepare(self, metadata, *, check=False, succeeds=True):
        command = [sys.executable, "-B", str(PREPARE), "--metadata", str(metadata)]
        if check:
            command.append("--check")
        result = subprocess.run(
            command, cwd=self.workspace, capture_output=True, text=True, timeout=30
        )
        diagnostic = f"{result.stdout}\n{result.stderr}"
        if succeeds:
            self.assertEqual(result.returncode, 0, diagnostic)
        else:
            self.assertNotEqual(result.returncode, 0, diagnostic)
        return result

    def assert_unpublished(self, metadata):
        self.assertFalse((metadata.parent / "source").exists())
        self.assertFalse((metadata.parent / "case-map.json").exists())
        self.assertEqual(list(metadata.parent.glob(".source-stage-*")), [])

    def test_collisions_update_includes_and_make_paths_without_changing_types(self):
        original_use = (
            '#include "Foo.H"\n'
            '#include "foo.H"\n'
            '#include "Bar.H"\n'
            "#include <bar.H>\n"
            '#include "Collections/Upper.H"\n'
            '#include "collections/lower.H"\n'
            "Foam::Foo Foo(const Foam::foo& foo);\n"
            "Foam::Bar Bar(const Foam::bar& bar);\n"
        )
        metadata = self.fixture({
            "src/library/Foo.H": "class Foo {};\n",
            "src/library/foo.H": "class foo {};\n",
            "src/library/Foo.C": '#include "Foo.H"\nFoo value;\n',
            "src/library/foo.C": '#include "foo.H"\nfoo value;\n',
            "src/one/Bar.H": "class Bar {};\n",
            "src/two/bar.H": "class bar {};\n",
            "src/library/Collections/Upper.H": "class Upper {};\n",
            "src/library/Collections/Upper.C": '#include "Upper.H"\n',
            "src/library/collections/lower.H": "class lower {};\n",
            "src/library/collections/lower.C": '#include "lower.H"\n',
            "src/library/Use.C": original_use,
            "src/library/Make/files": (
                "UPPER = Collections\n"
                "LOWER = collections\n"
                "$(UPPER)/Upper.C\n"
                "${LOWER}/lower.C\n"
                "Foo.C\n"
                "foo.C\n"
                "LIB = $(FOAM_LIBBIN)/libFoo\n"
            ),
        })
        self.run_prepare(metadata)
        source = metadata.parent / "source"
        for relative in (
            "src/library/Foo1.H", "src/library/foo0.H",
            "src/library/Foo1.C", "src/library/foo0.C",
            "src/one/Bar1.H", "src/two/bar0.H",
            "src/library/Collections1/Upper.H",
            "src/library/collections0/lower.H",
        ):
            self.assertTrue((source / relative).is_file(), relative)
        self.assertEqual(
            (source / "src/library/Use.C").read_text(),
            '#include "Foo1.H"\n'
            '#include "foo0.H"\n'
            '#include "Bar1.H"\n'
            "#include <bar0.H>\n"
            '#include "Collections1/Upper.H"\n'
            '#include "collections0/lower.H"\n'
            "Foam::Foo Foo(const Foam::foo& foo);\n"
            "Foam::Bar Bar(const Foam::bar& bar);\n",
        )
        self.assertEqual(
            (source / "src/library/Make/files").read_text(),
            "UPPER = Collections1\n"
            "LOWER = collections0\n"
            "$(UPPER)/Upper.C\n"
            "${LOWER}/lower.C\n"
            "Foo1.C\n"
            "foo0.C\n"
            "LIB = $(FOAM_LIBBIN)/libFoo\n",
        )
        self.assertEqual(
            (source / "src/library/Foo1.C").read_text(),
            '#include "Foo1.H"\nFoo value;\n',
        )
        paths = [str(path.relative_to(source)) for path in source.rglob("*")]
        self.assertEqual(len(paths), len({path.casefold() for path in paths}))
        report = json.loads((metadata.parent / "case-map.json").read_text())
        self.assertEqual(report["sourceCommit"], COMMIT)
        self.assertEqual(
            report["archiveSha256"], json.loads(metadata.read_text())["sha256"]
        )
        self.assertEqual(report["filenameRenames"]["Bar.H"], "Bar1.H")
        self.assertEqual(report["filenameRenames"]["bar.H"], "bar0.H")
        self.assertEqual(
            report["pathRenames"]["src/library/Collections"],
            "src/library/Collections1",
        )
        self.assertIn("src/library/Use.C", report["referenceModifiedFiles"])
        self.run_prepare(metadata, check=True)

    def test_general_rules_reference_does_not_rename_default_rules(self):
        metadata = self.fixture({
            "wmake/rules/General/CGAL": "GENERAL_UPPER = yes\n",
            "wmake/rules/General/cgal": "GENERAL_LOWER = yes\n",
            "wmake/rules/Default/cgal": "DEFAULT = yes\n",
            "wmake/rules/linux/cgal": (
                "include $(GENERAL_RULES)/CGAL\n"
                "include $(GENERAL_RULES)/cgal\n"
                "include $(DEFAULT_RULES)/cgal\n"
            ),
        })
        self.run_prepare(metadata)
        source = metadata.parent / "source"
        self.assertEqual(
            (source / "wmake/rules/linux/cgal").read_text(),
            "include $(GENERAL_RULES)/CGAL1\n"
            "include $(GENERAL_RULES)/cgal0\n"
            "include $(DEFAULT_RULES)/cgal\n",
        )
        self.assertTrue((source / "wmake/rules/General/CGAL1").is_file())
        self.assertTrue((source / "wmake/rules/General/cgal0").is_file())
        self.assertEqual(
            (source / "wmake/rules/Default/cgal").read_text(), "DEFAULT = yes\n"
        )
        self.run_prepare(metadata, check=True)

    def test_build_output_collisions_are_renamed_without_changing_other_targets(self):
        targets = {
            "applications/upper": ("EXE", "$(FOAM_APPBIN)/Test-Field", "Test-Field1"),
            "applications/lower": ("EXE", "$(FOAM_APPBIN)/Test-field", "Test-field0"),
            "src/upper": ("LIB", "$(FOAM_LIBBIN)/libField", "libField1"),
            "src/lower": ("LIB", "$(FOAM_LIBBIN)/libfield", "libfield0"),
            "applications/other": ("EXE", "$(FOAM_APPBIN)/solver", "solver"),
            "applications/system": ("EXE", "$(FOAM_APPBIN)/Sample", "Sample"),
            "applications/user": ("EXE", "$(FOAM_USER_APPBIN)/sample", "sample"),
        }
        files = {}
        for directory, (kind, target, _) in targets.items():
            files[f"{directory}/Make/files"] = f"Main.C\n\n{kind} = {target}\n"
            files[f"{directory}/Main.C"] = "class Field {}; class field {};\n"
        metadata = self.fixture(files)
        self.run_prepare(metadata)
        source = metadata.parent / "source"
        expected_renames = {}
        for directory, (kind, target, basename) in targets.items():
            translated = target.rsplit("/", 1)[0] + "/" + basename
            self.assertEqual(
                (source / directory / "Make/files").read_text(),
                f"Main.C\n\n{kind} = {translated}\n",
            )
            self.assertEqual(
                (source / directory / "Main.C").read_text(),
                "class Field {}; class field {};\n",
            )
            if target != translated:
                expected_renames[target] = translated
        report = json.loads((metadata.parent / "case-map.json").read_text())
        self.assertEqual(report["buildTargetRenames"], expected_renames)
        self.run_prepare(metadata, check=True)

    def test_pdr_tutorial_preserves_fields_and_rejects_insensitive_case_directory(self):
        tutorial = "tutorials/combustion/PDRFoam/flamePropagationWithObstacles"
        fields = {
            "B.gz": gzip.compress(b"FoamFile { object B; }\ninternalField uniform 0;\n", mtime=0),
            "b.gz": gzip.compress(b"FoamFile { object b; }\ninternalField uniform 1;\n", mtime=0),
            "U": b"FoamFile { object U; }\ninternalField uniform (0 0 0);\n",
        }
        files = {
            f"{tutorial}/Allrun": (
                '#!/bin/sh\n'
                'cd "${0%/*}" || exit 1\n'
                '. "${WM_PROJECT_DIR:?}/bin/tools/RunFunctions"\n'
                "\nrestore0Dir\n"
                "\nrunApplication blockMesh\n"
                "runApplication $(getApplication)\n"
            ),
            **{f"{tutorial}/0.orig/{name}": data for name, data in fields.items()},
        }
        metadata = self.fixture(files, modes={f"{tutorial}/Allrun": 0o755})
        self.run_prepare(metadata)
        case = metadata.parent / "source" / tutorial
        for original, renamed in (("B.gz", "B1.gz"), ("b.gz", "b0.gz"), ("U", "U")):
            self.assertEqual((case / "0.orig" / renamed).read_bytes(), fields[original])
        self.run_prepare(metadata, check=True)
        allrun = case / "Allrun"
        syntax = subprocess.run(
            ["sh", "-n", str(allrun)], capture_output=True, text=True, timeout=30
        )
        self.assertEqual(syntax.returncode, 0, syntax.stderr)
        tools = self.workspace / "mock-openfoam/bin/tools"
        tools.mkdir(parents=True)
        (tools / "RunFunctions").write_text(
            "restore0Dir() { printf 'restore\\n' >> \"$CALL_LOG\"; cp -R 0.orig 0; }\n"
            "runApplication() { printf 'run:%s\\n' \"$*\" >> \"$CALL_LOG\"; }\n"
            "getApplication() { printf 'PDRFoam\\n'; }\n"
        )
        log = self.workspace / "run-functions.log"
        environment = {
            **os.environ,
            "WM_PROJECT_DIR": str(self.workspace / "mock-openfoam"),
            "CALL_LOG": str(log),
        }
        # On sensitive hosts, exercise restoring both required field names too.
        probe = case / "0.orig/b1.gz"
        if not probe.exists():
            compatible = subprocess.run(
                ["sh", str(allrun)], env=environment,
                capture_output=True, text=True, timeout=30,
            )
            self.assertEqual(compatible.returncode, 0, compatible.stderr)
            self.assertEqual(log.read_text(), "restore\nrun:blockMesh\nrun:PDRFoam\n")
            self.assertEqual((case / "0/B.gz").read_bytes(), fields["B.gz"])
            self.assertEqual((case / "0/b.gz").read_bytes(), fields["b.gz"])
            log.unlink()
            probe.write_bytes(fields["B.gz"])
        incompatible = subprocess.run(
            ["sh", str(allrun)], env=environment,
            capture_output=True, text=True, timeout=30,
        )
        self.assertNotEqual(incompatible.returncode, 0)
        self.assertIn("case-sensitive", incompatible.stderr)
        self.assertFalse(log.exists(), "Incompatible cases must fail before any run helper.")
        self.assertEqual((case / "0.orig/B1.gz").read_bytes(), fields["B.gz"])
        self.assertEqual((case / "0.orig/b0.gz").read_bytes(), fields["b.gz"])

    def test_relative_symlinks_and_executable_modes_survive_renaming(self):
        metadata = self.fixture(
            {
                "src/Type/Type.H": "class Type {};\n",
                "src/type/type.H": "class type {};\n",
                "Allwmake": "#!/bin/sh\ncat src/Type/Type.H\n",
            },
            symlinks={
                "src/lnInclude/Type.H": "../Type/Type.H",
                "src/lnInclude/type.H": "../type/type.H",
                "src/Type/local.H": "Type.H",
            },
            modes={"Allwmake": 0o755},
        )
        self.run_prepare(metadata)
        source = metadata.parent / "source"
        for relative, target in (
            ("src/lnInclude/Type1.H", "../Type1/Type1.H"),
            ("src/lnInclude/type0.H", "../type0/type0.H"),
            ("src/Type1/local.H", "Type1.H"),
        ):
            link = source / relative
            self.assertTrue(link.is_symlink(), relative)
            self.assertEqual(os.readlink(link), target)
            self.assertTrue(link.is_file(), relative)
        self.assertEqual((source / "Allwmake").stat().st_mode & 0o777, 0o755)
        self.assertEqual(
            (source / "Allwmake").read_text(), "#!/bin/sh\ncat src/Type1/Type1.H\n"
        )
        self.run_prepare(metadata, check=True)
        (source / "Allwmake").chmod(0o644)
        self.assertIn(
            "mode", self.run_prepare(metadata, check=True, succeeds=False).stderr.lower()
        )

    def test_readme_and_license_bytes_are_preserved(self):
        readme = b"Foo.H foo.H\r\nCollections/Upper.H\xff\n"
        license_text = b"Copyright: Foo.H and foo.H\n"
        metadata = self.fixture({
            "Foo.H": "class Foo {};\n",
            "foo.H": "class foo {};\n",
            "README.md": readme,
            "docs/ReadMe": readme,
            "COPYING": license_text,
            "LICENSE.txt": license_text,
        })
        self.run_prepare(metadata)
        source = metadata.parent / "source"
        for relative, contents in (
            ("README.md", readme), ("docs/ReadMe", readme),
            ("COPYING", license_text), ("LICENSE.txt", license_text),
        ):
            self.assertEqual((source / relative).read_bytes(), contents)
        self.run_prepare(metadata, check=True)

    def test_hash_mismatch_is_rejected_before_publication(self):
        metadata = self.fixture({"file.H": "class File {};\n"})
        document = json.loads(metadata.read_text())
        document["sha256"] = "0" * 64
        metadata.write_text(json.dumps(document))
        result = self.run_prepare(metadata, succeeds=False)
        self.assertIn("SHA-256 mismatch", result.stderr)
        self.assert_unpublished(metadata)

    def test_malformed_case_groups_and_new_collisions_are_rejected(self):
        cases = (
            {"Ab.H": "", "aB.H": ""},
            {"Foo.H": "", "foo.H": "", "FOO.H": ""},
            {"Foo.H": "", "foo.H": "", "Foo1.H": ""},
        )
        for index, files in enumerate(cases):
            with self.subTest(files=list(files)):
                metadata = self.fixture(files, directory=f"case-{index}")
                self.run_prepare(metadata, succeeds=False)
                self.assert_unpublished(metadata)

    def test_archive_and_symlink_escapes_are_rejected(self):
        cases = (
            ({"../escaped.H": ""}, {}),
            ({"/absolute.H": ""}, {}),
            ({"safe.H": ""}, {"link.H": "../escaped.H"}),
            ({"safe.H": ""}, {"link.H": "/absolute.H"}),
        )
        for index, (files, symlinks) in enumerate(cases):
            with self.subTest(files=files, symlinks=symlinks):
                metadata = self.fixture(
                    files, symlinks=symlinks, directory=f"escape-{index}"
                )
                self.run_prepare(metadata, succeeds=False)
                self.assert_unpublished(metadata)
                self.assertFalse((self.workspace / "escaped.H").exists())

    def test_existing_local_modifications_are_never_overwritten(self):
        metadata = self.fixture({"Foo.H": "class Foo {};\n", "foo.H": "class foo {};\n"})
        self.run_prepare(metadata)
        report_path = metadata.parent / "case-map.json"
        original_report = report_path.read_bytes()
        self.run_prepare(metadata)
        self.run_prepare(metadata, check=True)
        changed = metadata.parent / "source/Foo1.H"
        changed.write_text("class Foo { int local_change; };\n")
        for check in (False, True):
            with self.subTest(check=check):
                self.run_prepare(metadata, check=check, succeeds=False)
                self.assertEqual(changed.read_text(), "class Foo { int local_change; };\n")
                self.assertEqual(report_path.read_bytes(), original_report)
        changed.write_text("class Foo {};\n")
        extra = metadata.parent / "source/local.H"
        extra.write_text("local source\n")
        self.run_prepare(metadata, check=True, succeeds=False)
        self.assertEqual(extra.read_text(), "local source\n")

    def test_check_requires_prepared_source_and_detects_case_map_changes(self):
        metadata = self.fixture({"file.H": "class File {};\n"})
        self.run_prepare(metadata, check=True, succeeds=False)
        self.assert_unpublished(metadata)
        self.run_prepare(metadata)
        report_path = metadata.parent / "case-map.json"
        report_path.write_text("{}\n")
        self.run_prepare(metadata, check=True, succeeds=False)
        self.assertEqual(report_path.read_text(), "{}\n")


if __name__ == "__main__":
    unittest.main()
