"""Public CLI integration checks using tiny compiled Mach-O runtime fixtures."""

import hashlib
import json
from pathlib import Path
import platform
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
import zipfile


CLI = Path(__file__).with_name("bundle-cfd-runtime.py")
COMMITS = {
    "freecad": "145529fe741292ff0b3977a01195bf0247425794",
    "paraview": "08f33c1718f5c6a7da86a2f3b4d9fb863cb5be1c",
    "openfoam": "a6e826bd55d5ce93d94d18fbd96c27ee7d90aeeb",
}


@unittest.skipUnless(platform.system() == "Darwin", "Mach-O integration checks require macOS")
class RuntimeBundleCLI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.compiled = tempfile.TemporaryDirectory(prefix="cfd-native-fixtures-")
        cls.addClassCleanup(cls.compiled.cleanup)
        cls.fixture = Path(cls.compiled.name)
        source = cls.fixture / "fixture.c"
        source.write_text("int fixture_value(void) { return 7; }\n")
        main = cls.fixture / "main.c"
        main.write_text(
            "#include <stdio.h>\n"
            "extern int fixture_value(void);\n"
            "int main(void) { puts(\"native fixture\"); return fixture_value() != 7; }\n"
        )
        cls.run_native([
            "clang", "-arch", "arm64", "-dynamiclib", str(source),
            "-Wl,-install_name,@rpath/libFixture.dylib",
            "-Wl,-headerpad_max_install_names", "-o", str(cls.fixture / "libFixture.dylib"),
        ])
        cls.run_native([
            "clang", "-arch", "arm64", str(main), "-L" + str(cls.fixture), "-lFixture",
            "-Wl,-rpath,@loader_path/../lib", "-Wl,-headerpad_max_install_names",
            "-o", str(cls.fixture / "native"),
        ])
        # The foreign architecture is inspected, never executed.
        cls.run_native([
            "clang", "-arch", "x86_64", "-dynamiclib", str(source),
            "-Wl,-install_name,@rpath/libFixture.dylib",
            "-o", str(cls.fixture / "foreign.dylib"),
        ])

    @staticmethod
    def run_native(arguments):
        return subprocess.run(
            arguments, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, timeout=60,
        )

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="cfd-bundle-cli-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.install = self.root / "install"
        self.bundle = self.root / "bundle"
        for component, commit in COMMITS.items():
            location = self.install / component
            (location / "bin").mkdir(parents=True)
            (location / "lib").mkdir()
            executable = {"freecad": "python3", "paraview": "vtkpython"}.get(component, "fixture")
            shutil.copy2(self.fixture / "native", location / "bin" / executable)
            shutil.copy2(self.fixture / "libFixture.dylib", location / "lib/libFixture.dylib")
            (location / "lib/alias.dylib").symlink_to("libFixture.dylib")
            manifest = {
                "schemaVersion": 1, "component": component, "target": "darwin-arm64",
                "sourceCommit": commit,
                "smoke": {
                    "status": "passed",
                    "checks": ["Synthetic fixture: compiled native dependency loads"],
                },
            }
            self.write_json(location / "runtime-manifest.json", manifest)
        (self.install / "openfoam/etc").mkdir()
        (self.install / "openfoam/etc/bashrc").write_text("# Synthetic test fixture\n")

    @staticmethod
    def write_json(path, value):
        path.write_text(json.dumps(value, indent=2) + "\n")

    def cli(self, *arguments, failure=None):
        result = subprocess.run(
            [sys.executable, "-B", str(CLI), *map(str, arguments)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=60,
        )
        if failure is None:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout)
            self.assertIn(failure, result.stderr)
            self.assertNotIn("Traceback", result.stderr)
        return result

    def assemble(self, failure=None):
        result = self.cli("assemble", "--install", self.install, "--output", self.bundle, failure=failure)
        if failure is not None:
            self.assertFalse(self.bundle.exists())
            self.assertEqual(list(self.root.glob(".cfd-bundle-*")), [])
        return result

    def change_manifest(self, component_name, **changes):
        path = self.install / component_name / "runtime-manifest.json"
        manifest = json.loads(path.read_text())
        manifest.update(changes)
        self.write_json(path, manifest)

    def change_load(self, old, new, relative="freecad/bin/python3"):
        self.run_native(["install_name_tool", "-change", old, new, str(self.install / relative)])

    def test_relocated_native_bundle_and_archive_preserve_contents(self):
        self.assemble()
        moved = self.root / "relocated" / "runtime"
        moved.parent.mkdir()
        self.bundle.rename(moved)
        self.cli("check", moved)
        if platform.machine() == "arm64":
            result = subprocess.run(
                [str(moved / "freecad/bin/python3")], cwd=self.root,
                env={"PATH": "/usr/bin:/bin"}, text=True, capture_output=True, timeout=10,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, "native fixture\n")
        output = self.root / "runtime.zip"
        self.cli("archive", moved, output)
        receipt = json.loads(output.with_suffix(".json").read_text())
        self.assertEqual(receipt["target"], "darwin-arm64")
        self.assertEqual(receipt["sourceCommits"], COMMITS)
        self.assertEqual(receipt["sha256"], hashlib.sha256(output.read_bytes()).hexdigest())
        self.assertEqual(receipt["size"], output.stat().st_size)
        with zipfile.ZipFile(output) as archive:
            self.assertEqual(archive.testzip(), None)
            entry = archive.getinfo("freecad/bin/python3")
            self.assertEqual(stat.S_IMODE(entry.external_attr >> 16), 0o755)
            link = archive.getinfo("freecad/lib/alias.dylib")
            self.assertTrue(stat.S_ISLNK(link.external_attr >> 16))
            self.assertEqual(archive.read(link), b"libFixture.dylib")
            archived_manifest = json.loads(archive.read("bundle.json"))
            self.assertEqual(
                receipt["sourceCommits"],
                {key: value["sourceCommit"] for key, value in archived_manifest["components"].items()},
            )

    def test_loader_path_load_and_executable_relative_rpath_are_supported(self):
        self.change_load("@rpath/libFixture.dylib", "@loader_path/../lib/alias.dylib")
        binary = self.install / "paraview/bin/vtkpython"
        self.run_native([
            "install_name_tool", "-rpath", "@loader_path/../lib", "@executable_path/../lib",
            str(binary),
        ])
        self.assemble()
        self.cli("check", self.bundle)

    def test_host_rpath_is_rejected_even_when_local_copy_exists(self):
        binary = self.install / "freecad/bin/python3"
        self.run_native(["install_name_tool", "-add_rpath", str(self.fixture), str(binary)])
        self.assemble(failure="Unsupported runtime path")

    def test_unresolved_rpath_is_rejected(self):
        binary = self.install / "freecad/bin/python3"
        self.run_native(["install_name_tool", "-delete_rpath", "@loader_path/../lib", str(binary)])
        self.assemble(failure="Unresolved or ambiguous @rpath")

    def test_ambiguous_rpath_is_rejected(self):
        other = self.install / "freecad/other"
        other.mkdir()
        shutil.copy2(self.fixture / "libFixture.dylib", other / "libFixture.dylib")
        self.run_native([
            "install_name_tool", "-add_rpath", "@loader_path/../other",
            str(self.install / "freecad/bin/python3"),
        ])
        self.assemble(failure="Unresolved or ambiguous @rpath")

    def test_absolute_host_load_is_rejected(self):
        self.change_load("@rpath/libFixture.dylib", str(self.fixture / "libFixture.dylib"))
        self.assemble(failure="Unsupported runtime path")

    def test_system_prefix_cannot_hide_path_escape(self):
        self.change_load("@rpath/libFixture.dylib", "/usr/lib/../../tmp/libFixture.dylib")
        self.assemble(failure="Unsupported runtime path")

    def test_shared_library_cannot_use_executable_relative_search_path(self):
        library = self.install / "freecad/lib/libFixture.dylib"
        self.run_native(["install_name_tool", "-add_rpath", "@executable_path/../lib", str(library)])
        self.assemble(failure="Unsupported runtime path")

    def test_relative_load_cannot_escape_bundle(self):
        self.change_load("@rpath/libFixture.dylib", "@loader_path/../../../../outside.dylib")
        shutil.copy2(self.fixture / "libFixture.dylib", self.root / "outside.dylib")
        self.assemble(failure="is not in the subpath")

    def test_non_native_file_cannot_satisfy_dynamic_library_load(self):
        (self.install / "freecad/lib/libFixture.dylib").write_text("not a dynamic library\n")
        self.assemble(failure="Library path is not Mach-O")

    def test_foreign_architecture_is_rejected(self):
        shutil.copy2(self.fixture / "foreign.dylib", self.install / "freecad/lib/libFixture.dylib")
        self.assemble(failure="Expected arm64-only Mach-O")

    def test_script_only_placeholders_cannot_be_packaged_as_native_runtime(self):
        for component in COMMITS:
            for binary in (self.install / component / "bin").iterdir():
                binary.write_text("#!/bin/sh\nexit 0\n")
            (self.install / component / "lib/libFixture.dylib").write_text("placeholder\n")
        self.assemble(failure="no compiled Mach-O code")

    def test_entrypoint_requires_executable_mode(self):
        binary = self.install / "freecad/bin/python3"
        binary.chmod(0o644)
        self.assemble(failure="entrypoint is not executable")

    def test_component_source_platform_and_smoke_are_required(self):
        invalid = [
            {"schemaVersion": 2},
            {"component": "unrelated"},
            {"target": "linux-arm64"},
            {"sourceCommit": "0" * 40},
            {"smoke": None},
            {"smoke": {"status": "failed", "checks": ["failed fixture"]}},
            {"smoke": {"status": "passed", "checks": []}},
            {"smoke": {"status": "passed", "checks": [""]}},
            {"smoke": {"status": "passed", "checks": ["fixture"], "artifactSha256": "0" * 64}},
        ]
        path = self.install / "freecad/runtime-manifest.json"
        original = path.read_bytes()
        for changes in invalid:
            with self.subTest(changes=changes):
                path.write_bytes(original)
                self.change_manifest("freecad", **changes)
                self.assemble(failure="packaging failed")
        path.write_bytes(original)
        path.unlink()
        self.assemble(failure="runtime-manifest.json")

    def test_bundle_provenance_is_rechecked_before_archiving(self):
        self.assemble()
        bundle_manifest = self.bundle / "bundle.json"
        manifest = json.loads(bundle_manifest.read_text())
        manifest["components"]["freecad"]["sourceCommit"] = "0" * 40
        self.write_json(bundle_manifest, manifest)
        self.cli("check", self.bundle, failure="provenance differs")
        output = self.root / "bad.zip"
        self.cli("archive", self.bundle, output, failure="provenance differs")
        self.assertFalse(output.exists())
        self.assertFalse(output.with_suffix(".json").exists())

    def test_changed_component_manifest_is_rejected_with_updated_file_inventory(self):
        self.assemble()
        path = self.bundle / "freecad/runtime-manifest.json"
        component = json.loads(path.read_text())
        component["sourceCommit"] = "0" * 40
        self.write_json(path, component)
        path_manifest = self.bundle / "bundle.json"
        manifest = json.loads(path_manifest.read_text())
        manifest["components"]["freecad"] = component
        record = manifest["files"]["freecad/runtime-manifest.json"]
        record["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        record["size"] = path.stat().st_size
        self.write_json(path_manifest, manifest)
        self.cli("check", self.bundle, failure="Unrecognized compiled component")

    def test_modified_file_mode_and_link_are_detected(self):
        self.assemble()
        path = self.bundle / "openfoam/etc/bashrc"
        original = path.read_bytes()
        path.write_bytes(original + b"# altered\n")
        self.cli("check", self.bundle, failure="files were changed")
        path.write_bytes(original)
        original_mode = stat.S_IMODE(path.stat().st_mode)
        path.chmod(original_mode ^ stat.S_IXUSR)
        self.cli("check", self.bundle, failure="files were changed")
        path.chmod(original_mode)
        alias = self.bundle / "freecad/lib/alias.dylib"
        alias.unlink()
        alias.symlink_to("../../paraview/lib/libFixture.dylib")
        self.cli("check", self.bundle, failure="files were changed")

    def test_bundle_manifest_cannot_be_an_external_link(self):
        self.assemble()
        path = self.bundle / "bundle.json"
        external = self.root / "external-manifest.json"
        path.rename(external)
        path.symlink_to("../external-manifest.json")
        self.cli("check", self.bundle, failure="manifest must be a regular file")

    def test_unsafe_and_broken_package_links_are_rejected(self):
        alias = self.install / "freecad/lib/alias.dylib"
        for target in (str(self.fixture / "libFixture.dylib"), "missing.dylib"):
            with self.subTest(target=target):
                alias.unlink()
                alias.symlink_to(target)
                self.assemble(failure="packaging failed")

    def test_existing_bundle_and_broken_output_link_are_preserved(self):
        self.bundle.mkdir()
        marker = self.bundle / "local-change"
        marker.write_text("keep me\n")
        self.cli("assemble", "--install", self.install, "--output", self.bundle, failure="already exists")
        self.assertEqual(marker.read_text(), "keep me\n")
        shutil.rmtree(self.bundle)
        self.bundle.symlink_to("missing-directory")
        self.cli("assemble", "--install", self.install, "--output", self.bundle, failure="already exists")
        self.assertTrue(self.bundle.is_symlink())
        self.assertFalse((self.root / "missing-directory").exists())

    def test_archive_rejects_wrong_suffix_existing_files_and_bundle_destination(self):
        self.assemble()
        wrong = self.root / "output.json"
        wrong.write_text("keep existing receipt\n")
        self.cli("archive", self.bundle, wrong, failure=".zip suffix")
        self.assertEqual(wrong.read_text(), "keep existing receipt\n")
        output = self.root / "runtime.zip"
        output.write_bytes(b"existing archive")
        self.cli("archive", self.bundle, output, failure="already exists")
        self.assertEqual(output.read_bytes(), b"existing archive")
        output.unlink()
        receipt = output.with_suffix(".json")
        receipt.write_text("existing receipt\n")
        self.cli("archive", self.bundle, output, failure="already exists")
        self.assertFalse(output.exists())
        self.assertEqual(receipt.read_text(), "existing receipt\n")
        receipt.unlink()
        output.symlink_to("uncreated.zip")
        self.cli("archive", self.bundle, output, failure="already exists")
        self.assertTrue(output.is_symlink())
        self.assertFalse((self.root / "uncreated.zip").exists())
        self.cli("archive", self.bundle, self.bundle / "internal.zip", failure="outside the bundle")
        self.assertFalse((self.bundle / "internal.zip").exists())

    def test_declared_os_version_cannot_hide_newer_native_requirements(self):
        self.assemble()
        path = self.bundle / "bundle.json"
        manifest = json.loads(path.read_text())
        manifest["minimumMacOS"] = "1.0"
        self.write_json(path, manifest)
        self.cli("check", self.bundle, failure="minimum macOS differs")


if __name__ == "__main__":
    unittest.main(verbosity=2)
