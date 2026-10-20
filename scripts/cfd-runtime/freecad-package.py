#!/usr/bin/env python3
"""Assemble and relocate a minimal macOS FreeCAD/CfdOF runtime from native outputs."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import tempfile


QT_MODULES = (
    "Core", "Concurrent", "Network", "Xml", "Gui", "Widgets", "OpenGL",
    "OpenGLWidgets", "PrintSupport", "Svg", "SvgWidgets", "UiTools",
)
PYTHON_MODULES = (
    "numpy", "matplotlib", "mpl_toolkits", "pylab.py", "PIL", "contourpy",
    "cycler", "dateutil", "fontTools", "kiwisolver", "packaging", "pyparsing",
    "six.py", "pivy", "shiboken6", "typing_extensions.py", "unicodedata2",
)
WORKBENCHES = ("Material", "Part", "Mesh", "MeshPart", "Fem", "Plot")
MAGIC = (b"\xcf\xfa\xed\xfe", b"\xfe\xed\xfa\xcf", b"\xca\xfe\xba\xbe")
SYSTEM = ("/usr/lib/", "/System/Library/", "/Library/Apple/System/")
PYSIDE_LIBRARY = "libpyside6.cpython-311-darwin.6.8.dylib"


def macho(path):
    with path.open("rb") as stream:
        return stream.read(4) in MAGIC


def output(command):
    return subprocess.check_output(command, text=True).strip()


class Package:
    def __init__(self, root, native, deps, pyside_patch, destination):
        self.root, self.native, self.deps = root, native, deps
        self.pyside_patch = pyside_patch
        self.pyside_manifest = json.loads((pyside_patch / "runtime-manifest.json").read_text())
        self.destination = destination
        self.origins = {}
        self.binary_queue = []
        self.minimum_macos = (0, 0)
        self.used_packages = set()
        self.owners = {}
        self.records = {}
        for record_file in (deps / "conda-meta").glob("*.json"):
            record = json.loads(record_file.read_text())
            self.records[record["name"]] = record
            for file in record["files"]:
                self.owners[file] = record["name"]

    def copy(self, source, relative):
        target = self.destination / relative
        if relative in self.origins:
            return target
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        self.origins[relative] = source
        if source.is_relative_to(self.deps):
            owner = self.owners.get(source.relative_to(self.deps).as_posix())
            if owner:
                self.used_packages.add(owner)
        if macho(target):
            self.binary_queue.append(relative)
        return target

    def tree(self, source, relative, ignore=()):
        for current, directories, files in os.walk(source, followlinks=True):
            directories[:] = [
                name for name in directories
                if name not in ("__pycache__", ".git", "tests", "test", *ignore)
            ]
            for name in files:
                if name.endswith((".pyc", ".pyo", ".a")) or name in ignore or name.startswith("_test"):
                    continue
                path = Path(current) / name
                self.copy(path, relative / path.relative_to(source))

    def seed(self):
        # Only the selected workbenches and their resources enter the package.
        for workbench in WORKBENCHES:
            source = self.native / "Mod" / workbench
            if source.exists():
                self.tree(source, Path("Mod") / workbench)
        for folder in ("Ext", "data", "share"):
            source = self.native / folder
            if source.exists():
                self.tree(source, Path(folder), ignore=("QtWebEngineWidgets.py",))
        self.tree(self.native / "Gui/Stylesheets", Path("Gui/Stylesheets"))
        # Upstream configures a machine-specific fallback into this namespace.
        # Regenerate that one expression from its original template for relocation.
        namespace = self.root / "runtime/freecad/src/Ext/freecad/__init__.py.template"
        relative_library = '_os.path.normpath(_os.path.join(_os.path.dirname(__file__), "..", "..", "lib"))'
        (self.destination / "Ext/freecad/__init__.py").write_text(
            namespace.read_text().replace('"${FREECAD_LIBRARY_INSTALL_DIR}"', relative_library)
        )
        for path in (self.native / "lib").iterdir():
            if path.is_file() and (path.suffix in (".so", ".dylib") or ".dylib." in path.name):
                self.copy(path, Path("lib") / path.name)
        interpreter = self.destination / "bin/python3.11"
        interpreter.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([
            "clang", "-arch", "arm64", "-mmacosx-version-min=13.0",
            "-I" + str(self.deps / "include/python3.11"),
            str(Path(__file__).with_name("freecad-python.c")),
            "-L" + str(self.deps / "lib"), "-lpython3.11",
            "-Wl,-rpath,@loader_path/../lib", "-Wl,-headerpad_max_install_names",
            "-o", str(interpreter),
        ], check=True)
        self.origins[Path("bin/python3.11")] = self.deps / "bin/python3.11"
        self.binary_queue.append(Path("bin/python3.11"))
        self.used_packages.add("python")
        stdlib = self.deps / "lib/python3.11"
        self.tree(
            stdlib, Path("lib/python3.11"),
            ignore=("site-packages", "config-3.11-darwin", "idlelib", "tkinter",
                    "turtledemo", "ensurepip", "_tkinter.cpython-311-darwin.so"),
        )
        site = stdlib / "site-packages"
        for name in PYTHON_MODULES:
            candidates = [site / name]
            if not candidates[0].exists():
                candidates = list(site.glob(name + ".*.so"))
            if not candidates:
                raise RuntimeError(f"Required Python runtime module missing: {name}")
            for path in candidates:
                relative = Path("lib/python3.11/site-packages") / path.name
                if path.is_dir():
                    self.tree(
                        path, relative,
                        ignore=("gui", "qt", "quarter", "interactive") if name == "pivy" else (),
                    )
                else:
                    self.copy(path, relative)
        pyside = site / "PySide6"
        for name in ("__init__.py", "_config.py", "_git_pyside_version.py"):
            self.copy(pyside / name, Path("lib/python3.11/site-packages/PySide6") / name)
        for module in QT_MODULES:
            for path in pyside.glob(f"Qt{module}.*.so"):
                self.copy(path, Path("lib/python3.11/site-packages/PySide6") / path.name)
        for path in (pyside / "support").rglob("*.py"):
            self.copy(path, Path("lib/python3.11/site-packages/PySide6") / path.relative_to(pyside))
        # Metadata is needed by importlib.metadata, and retains Python licenses.
        selected = {name.lower().replace("_", "-").replace(".py", "") for name in PYTHON_MODULES}
        selected.update(("pyside6", "pillow", "python-dateutil"))
        for path in site.iterdir():
            if not path.name.endswith((".dist-info", ".egg-info")):
                continue
            name = path.name.split("-")[0].lower().replace("_", "-")
            if name in selected:
                self.tree(path, Path("lib/python3.11/site-packages") / path.name)
        plugin_root = self.deps / "lib/qt6/plugins"
        for relative in (
            "platforms/libqoffscreen.dylib", "platforms/libqcocoa.dylib",
            "imageformats/libqsvg.dylib", "imageformats/libqjpeg.dylib",
            "iconengines/libqsvgicon.dylib", "styles/libqmacstyle.dylib",
            "tls/libqsecuretransportbackend.dylib",
        ):
            source = plugin_root / relative
            if not source.is_file():
                raise RuntimeError(f"Required Qt plugin is missing: {relative}")
            self.copy(source, Path("lib/qt6/plugins") / relative)
        certificate = self.deps / "ssl/cert.pem"
        if certificate.is_file():
            self.copy(certificate, Path("ssl/cert.pem"))
        for source in self.root.joinpath("runtime/freecad").rglob("*"):
            if source.is_file() and source.name.upper().startswith(("LICENSE", "COPYING", "COPYRIGHT")):
                self.copy(
                    source, Path("licenses/freecad") / source.relative_to(self.root / "runtime/freecad")
                )
        self.tree(
            self.pyside_patch / "licenses", Path("licenses/dependencies/pyside6/source-patch")
        )

    def resolve(self, dependency, origin):
        # PYSIDE-3148 corrupts unrelated Python signal connections when native
        # CfdOF panels close. Use the separately source-built upstream fix.
        if Path(dependency).name == PYSIDE_LIBRARY:
            return self.pyside_patch / "lib" / PYSIDE_LIBRARY
        # AppleClang links the OS libc++, while the OCCT/Qt SDK uses conda's
        # libc++. Their C++ objects cross the FreeCAD boundary, so every packaged
        # image must use the same implementation (notably std::locale in BREP IO).
        if dependency == "/usr/lib/libc++.1.dylib":
            return self.deps / "lib/libc++.1.dylib"
        if dependency.startswith(SYSTEM):
            return None
        if dependency.startswith("@loader_path/"):
            candidates = [origin.parent / dependency.removeprefix("@loader_path/")]
        elif dependency.startswith("@executable_path/"):
            candidates = [
                self.deps / "bin" / dependency.removeprefix("@executable_path/"),
                self.native / "bin" / dependency.removeprefix("@executable_path/"),
            ]
        elif dependency.startswith("@rpath/"):
            suffix = dependency.removeprefix("@rpath/")
            candidates = [self.native / "lib" / suffix, self.deps / "lib" / suffix, origin.parent / suffix]
        else:
            candidates = [Path(dependency)]
        for candidate in candidates:
            if candidate.is_file():
                resolved = candidate.resolve()
                if any(resolved.is_relative_to(prefix) for prefix in (
                    self.native, self.deps, self.pyside_patch,
                )):
                    return candidate
        raise RuntimeError(f"Unresolved or external native dependency: {dependency} ({origin.name})")

    def relocate(self):
        processed = set()
        while self.binary_queue:
            relative = self.binary_queue.pop()
            if relative in processed:
                continue
            processed.add(relative)
            path = self.destination / relative
            origin = self.origins[relative]
            changes = []
            for line in output(["otool", "-L", str(path)]).splitlines()[1:]:
                if not line.startswith("\t"):
                    continue
                dependency = line.strip().split(" (compatibility version", 1)[0]
                source = self.resolve(dependency, origin)
                if source is None:
                    continue
                destination = self.copy(source, Path("lib") / source.name)
                replacement = "@loader_path/" + os.path.relpath(destination, path.parent)
                if dependency != replacement:
                    changes.extend(("-change", dependency, replacement))
            if changes:
                subprocess.run(["install_name_tool", *changes, str(path)], check=True)
            load_commands = output(["otool", "-l", str(path)]).splitlines()
            rpaths = set()
            for index, line in enumerate(load_commands):
                if line.strip() == "cmd LC_RPATH":
                    rpaths.add(load_commands[index + 2].strip().split(" (offset ", 1)[0].removeprefix("path "))
                minimum = re.fullmatch(r"\s*minos\s+([\d.]+)", line)
                if minimum is None and index > 1 and load_commands[index - 2].strip() == "cmd LC_VERSION_MIN_MACOSX":
                    minimum = re.fullmatch(r"\s*version\s+([\d.]+)", line)
                if minimum:
                    self.minimum_macos = max(
                        self.minimum_macos, tuple(int(part) for part in minimum[1].split("."))
                    )
            for rpath in rpaths:
                subprocess.run(["install_name_tool", "-delete_rpath", rpath, str(path)], check=True)
            if path.suffix == ".dylib":
                subprocess.run(
                    ["install_name_tool", "-id", "@rpath/" + path.name, str(path)], check=True
                )
            subprocess.run(["codesign", "--force", "--sign", "-", str(path)], check=True, capture_output=True)
        return len(processed)

    def finish(self, binary_count):
        (self.destination / "bin/python3").write_text(
            "#!/bin/sh\n"
            'runtime=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)\n'
            'export PYTHONNOUSERSITE=1\n'
            'export PYTHONHOME="$runtime"\n'
            'export PYTHONPATH="$runtime/lib:$runtime/Ext${PYTHONPATH:+:$PYTHONPATH}"\n'
            'export QT_PLUGIN_PATH="$runtime/lib/qt6/plugins"\n'
            'unset QT_QPA_PLATFORM_PLUGIN_PATH DYLD_LIBRARY_PATH DYLD_FALLBACK_LIBRARY_PATH\n'
            'export SSL_CERT_FILE="$runtime/ssl/cert.pem"\n'
            'exec "$runtime/bin/python3.11" "$@"\n'
        )
        (self.destination / "bin/python3").chmod(0o755)
        for name in sorted(self.used_packages):
            record = self.records[name]
            source = self.root / ".tools/cfd/mamba/pkgs" / (
                record["name"] + "-" + record["version"] + "-" + record["build"]
            ) / "info"
            for folder in ("licenses", "recipe"):
                if (source / folder).is_dir():
                    if folder == "licenses":
                        self.tree(source / folder, Path("licenses/dependencies") / name)
                    else:
                        for path in (source / folder).rglob("*"):
                            if path.is_file() and path.name.upper().startswith(("LICENSE", "COPYING", "COPYRIGHT")):
                                self.copy(path, Path("licenses/dependencies") / name / path.name)
            metadata = self.destination / "licenses/dependencies" / name / "package.json"
            metadata.parent.mkdir(parents=True, exist_ok=True)
            metadata.write_text(json.dumps({
                key: record[key] for key in ("name", "version", "build", "url", "sha256", "license")
                if key in record
            }, indent=2) + "\n")
        manifest = {
            "schemaVersion": 1, "component": "freecad", "target": "darwin-arm64",
            "minimumMacOS": ".".join(str(part) for part in self.minimum_macos),
            "sourceCommit": output(["git", "-C", str(self.root / "runtime/freecad"), "rev-parse", "HEAD"]),
            "build": {
                "type": "Release", "source": "runtime/freecad",
                "recipe": "scripts/cfd-runtime/freecad-minimal.cmake",
                "pysidePatch": self.pyside_manifest,
                "dependencyLockSha256": hashlib.sha256(
                    Path(__file__).with_name("freecad-dependencies.json").read_bytes()
                ).hexdigest(),
            },
            "entrypoint": "bin/python3", "workbenches": WORKBENCHES,
            "qtModules": sorted({
                re.match(r"libQt6([^.]+)", path.name)[1]
                for path in (self.destination / "lib").glob("libQt6*.dylib")
            }),
            "pysideModules": QT_MODULES,
            "nativeBinaryCount": binary_count, "dependencyPackages": sorted(self.used_packages),
            "smoke": {"status": "not-run"},
        }
        (self.destination / "runtime-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


def main():
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--native", type=Path, default=root / ".tools/cfd/install/freecad-native")
    parser.add_argument("--deps", type=Path, default=root / ".tools/cfd/deps/freecad")
    parser.add_argument("--pyside-patch", type=Path, default=root / ".tools/cfd/install/pyside-patch")
    parser.add_argument("--output", type=Path, default=root / ".tools/cfd/install/freecad")
    args = parser.parse_args()
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        parser.error("This relocation profile supports macOS arm64 only.")
    native, deps = args.native.resolve(strict=True), args.deps.resolve(strict=True)
    pyside_patch = args.pyside_patch.resolve(strict=True)
    if not (pyside_patch / "lib" / PYSIDE_LIBRARY).is_file():
        parser.error("The source-built PySide lifecycle fix is missing.")
    pyside_manifest = json.loads((pyside_patch / "runtime-manifest.json").read_text())
    if pyside_manifest.get("smoke", {}).get("status") != "passed":
        parser.error("The PySide lifecycle fix must pass its public API regression check.")
    for module in ("FreeCAD", "FreeCADGui", "Part", "Mesh", "MeshPart", "Fem"):
        if not (native / "lib" / (module + ".so")).is_file():
            parser.error(f"Native installation is incomplete: lib/{module}.so is missing.")
    destination = args.output.resolve()
    if destination.exists():
        parser.error("Output already exists; choose a new --output.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".freecad-package-", dir=destination.parent) as temporary:
        package = Package(root, native, deps, pyside_patch, Path(temporary) / "runtime")
        package.seed()
        count = package.relocate()
        package.finish(count)
        package.destination.rename(destination)
    print(f"Packaged {count} native binaries at {destination}. Native smoke validation is still required.")


if __name__ == "__main__":
    main()
