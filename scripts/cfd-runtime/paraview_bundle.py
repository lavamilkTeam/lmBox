"""Package and verify the Python and Mach-O closure of the VTK runtime."""

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


MACHO_MAGICS = {
    b"\xce\xfa\xed\xfe", b"\xcf\xfa\xed\xfe",
    b"\xfe\xed\xfa\xce", b"\xfe\xed\xfa\xcf",
    b"\xca\xfe\xba\xbe", b"\xbe\xba\xfe\xca",
    b"\xca\xfe\xba\xbf", b"\xbf\xba\xfe\xca",
}
SYSTEM_PREFIXES = ("/usr/lib/", "/System/Library/")
# Field extraction has no network, database, GUI, FFI or interactive terminal use.
EXCLUDED_PYTHON_EXTENSIONS = {
    "_tkinter", "_ssl", "_hashlib", "_sqlite3", "_gdbm", "_dbm",
    "_ctypes", "_ctypes_test", "_curses", "_curses_panel", "readline",
    "_decimal", "_lzma",
}
ROOT_MODULES = (
    "vtkCommonCore", "vtkCommonDataModel", "vtkFiltersCore", "vtkFiltersFlowPaths",
    "vtkFiltersGeometry", "vtkFiltersExtraction", "vtkIOParallel",
)


def output(*command):
    return subprocess.check_output(command, text=True)


def macho(path):
    if not path.is_file() or path.is_symlink():
        return False
    with path.open("rb") as stream:
        return stream.read(4) in MACHO_MAGICS


def dependencies(path):
    return [
        line.strip().split(" (compatibility version", 1)[0]
        for line in output("otool", "-L", str(path)).splitlines()[1:]
        if " (compatibility version" in line
    ]


def rpaths(path):
    return re.findall(
        r"cmd LC_RPATH\n\s+cmdsize \d+\n\s+path (.+?) \(offset",
        output("otool", "-l", str(path)),
    )


def install_python(install, interpreter):
    config = json.loads(output(
        interpreter, "-c",
        "import json,sys,sysconfig; print(json.dumps({"
        "'version':sys.version.split()[0],"
        "'stdlib':sysconfig.get_path('stdlib'),"
        "'library':sysconfig.get_config_var('LIBDIR')+'/libpython3.12.dylib'}))",
    ))
    if not config["version"].startswith("3.12."):
        raise ValueError("This runtime preset requires Python 3.12.")
    library = Path(config["library"]).resolve()
    shutil.copy2(library, install / "lib/libpython3.12.dylib")
    python_license = next(
        (parent / name for parent in library.parents
         for name in ("LICENSE", "LICENSE.txt") if (parent / name).is_file()), None
    )
    if python_license is None:
        raise ValueError("The selected Python build dependency has no license file.")
    license_directory = install / "share/licenses"
    license_directory.mkdir(parents=True, exist_ok=True)
    shutil.copy2(python_license, license_directory / "Python-LICENSE.txt")
    stdlib = Path(config["stdlib"])
    shutil.copytree(
        stdlib, install / "lib/python3.12", dirs_exist_ok=True,
        ignore=shutil.ignore_patterns(
            "__pycache__", "*.pyc", "site-packages", "test", "tests",
            "idlelib", "tkinter", "turtledemo", "ensurepip", "config-3.12*",
        ),
    )
    origins = {install / "lib/libpython3.12.dylib": library}
    for path in (install / "lib/python3.12/lib-dynload").iterdir():
        if path.name.split(".", 1)[0] in EXCLUDED_PYTHON_EXTENSIONS or path.name.startswith(("_test", "_xx")):
            path.unlink()
        elif macho(path):
            origins[path] = stdlib / "lib-dynload" / path.name
    return config["version"], origins


def copy_dependency_licenses(install, origins):
    license_root = install / "share/licenses"
    visited = set()
    for original in origins.values():
        package = next(
            (parent for parent in original.parents
             if parent.parent.parent.name == "Cellar"), None
        )
        if package is None or package in visited:
            continue
        visited.add(package)
        destination = license_root / f"{package.parent.name}-{package.name}"
        candidates = [
            path for path in package.iterdir()
            if path.is_file() and path.name.lower().startswith(("license", "copying", "copyright"))
        ]
        if (package / "share/doc").is_dir():
            candidates.extend(
                path for path in (package / "share/doc").rglob("*")
                if path.is_file() and path.name.lower().startswith(("license", "copying", "copyright"))
            )
        if not candidates:
            raise ValueError(f"Missing license for bundled dependency: {package.parent.name}")
        for original_license in candidates:
            target = destination / original_license.relative_to(package)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(original_license, target)


def close_libraries(install, origins):
    pending = [path for path in install.rglob("*") if macho(path)]
    processed = set()
    while pending:
        path = pending.pop()
        if path in processed:
            continue
        processed.add(path)
        origin = origins.get(path, path)
        changes = []
        for dependency in dependencies(path):
            if dependency.startswith(SYSTEM_PREFIXES):
                continue
            if "Qt" in dependency:
                raise ValueError(f"Unexpected Qt dependency: {path.name}: {dependency}")
            basename = "libpython3.12.dylib" if dependency.endswith("/Python") else Path(dependency).name
            target = install / "lib" / basename
            if not target.exists():
                if dependency.startswith("/"):
                    original = Path(dependency)
                elif dependency.startswith("@loader_path/"):
                    original = origin.parent / dependency[len("@loader_path/"):]
                elif dependency.startswith("@rpath/"):
                    candidates = [
                        Path(value.replace("@loader_path", str(origin.parent))) / basename
                        for value in rpaths(origin)
                    ]
                    original = next((candidate for candidate in candidates if candidate.exists()), None)
                else:
                    original = None
                if original is None or not original.is_file():
                    raise ValueError(f"Unresolved dependency of {path.name}: {dependency}")
                shutil.copy2(original.resolve(), target)
                origins[target] = original.resolve()
                pending.append(target)
            relative = "@loader_path/" + os.path.relpath(target, path.parent)
            changes.extend(["-change", dependency, relative])
        for rpath in dict.fromkeys(rpaths(path)):
            changes.extend(["-delete_rpath", rpath])
        if path.suffix == ".dylib":
            changes.extend(["-id", "@rpath/" + path.name])
        if changes:
            subprocess.run(["install_name_tool", *changes, str(path)], check=True)
        subprocess.run(["codesign", "--force", "--sign", "-", str(path)], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def prune_runtime(install):
    imports = json.dumps(["vtkmodules." + name for name in ROOT_MODULES])
    probe = (
        "import importlib,json,sys;"
        f"[importlib.import_module(name) for name in {imports}];"
        "print(json.dumps(sorted(name.split('.')[-1] for name in sys.modules"
        " if name.startswith('vtkmodules.vtk'))))"
    )
    required_wrappers = set(json.loads(subprocess.check_output(
        [str(install / "bin/vtkpython"), "-c", probe],
        text=True, env={"PATH": "/usr/bin:/bin:/usr/sbin:/sbin"},
    )))
    wrappers = install / "lib/python3.12/site-packages/vtkmodules"
    for path in wrappers.glob("*.so"):
        if path.name.split(".", 1)[0] not in required_wrappers:
            path.unlink()
    pending = [path for path in (install / "lib/python3.12").rglob("*") if macho(path)]
    pending.append(install / "libexec/vtkpython")
    needed = set()
    while pending:
        path = pending.pop().resolve()
        if path in needed:
            continue
        needed.add(path)
        for dependency in dependencies(path):
            if dependency.startswith("@loader_path/"):
                pending.append(path.parent / dependency[len("@loader_path/"):])
    libraries = [(path, path.resolve()) for path in (install / "lib").glob("*.dylib")]
    for path, resolved in libraries:
        if resolved not in needed:
            path.unlink()


def bundle(install, interpreter, source, root):
    version, origins = install_python(install, interpreter)
    libexec = install / "libexec"
    libexec.mkdir(exist_ok=True)
    shutil.move(install / "bin/vtkpython", libexec / "vtkpython")
    for executable in ("pvbatch", "pvdataserver", "pvrenderserver", "pvserver", "paraview-config"):
        (install / "bin" / executable).unlink(missing_ok=True)
    for relative in ("lib/python3.12/site-packages/vtkmodules/qt",
                     "lib/python3.12/site-packages/vtkmodules/gtk",
                     "lib/python3.12/site-packages/vtkmodules/tk",
                     "lib/python3.12/site-packages/vtkmodules/wx"):
        shutil.rmtree(install / relative, ignore_errors=True)
    close_libraries(install, origins)
    launcher = install / "bin/vtkpython"
    launcher.write_text(
        '#!/bin/sh\nset -eu\n'
        'runtime="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"\n'
        'export PYTHONHOME="$runtime"\n'
        'export PYTHONPATH="$runtime/lib/python3.12/site-packages"\n'
        'export PYTHONNOUSERSITE=1\n'
        'export PYTHONDONTWRITEBYTECODE=1\n'
        'exec "$runtime/libexec/vtkpython" "$@"\n'
    )
    launcher.chmod(0o755)
    prune_runtime(install)
    licenses = install / "share/licenses"
    licenses.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / "runtime/paraview/Copyright.txt", licenses / "ParaView-Copyright.txt")
    shutil.copy2(root / "runtime/paraview/VTK/Copyright.txt", licenses / "VTK-Copyright.txt")
    copy_dependency_licenses(install, origins)
    audit = inspect_bundle(install)
    manifest = {
        "schemaVersion": 1, "component": "paraview", "platform": "macos-arm64",
        "target": "darwin-arm64", "sourceCommit": source["paraview"]["commit"],
        "minimumMacOS": audit["minimumMacOS"],
        "build": source, "edition": "VTK extraction", "pythonVersion": version,
        "pythonProvenance": "Bundled build-toolchain CPython library and standard library",
        "entrypoint": "bin/vtkpython", "qt": False, "openglBackend": False,
        "excludedPythonExtensions": sorted(EXCLUDED_PYTHON_EXTENSIONS),
        "requestedModules": [
            "VTK::CommonCore", "VTK::CommonDataModel", "VTK::FiltersCore",
            "VTK::FiltersFlowPaths", "VTK::FiltersGeometry",
            "VTK::FiltersExtraction", "VTK::IOParallel",
        ],
        "installedLibraries": sorted(
            path.name for path in (install / "lib").glob("*.dylib") if not path.is_symlink()
        ),
        "wrappedModules": sorted(
            path.name.split(".", 1)[0]
            for path in (install / "lib/python3.12/site-packages/vtkmodules").glob("*.so")
        ),
        "audit": audit,
    }
    (install / "runtime-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


def fingerprint(install):
    digest = hashlib.sha256()
    for path in sorted(install.rglob("*")):
        if path == install / "runtime-manifest.json" or (path.is_dir() and not path.is_symlink()):
            continue
        digest.update(path.relative_to(install).as_posix().encode() + b"\0")
        if path.is_symlink():
            digest.update(b"link\0" + os.readlink(path).encode())
        else:
            digest.update(b"file\0" + str(path.stat().st_mode & 0o777).encode() + b"\0")
            with path.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
        digest.update(b"\0")
    return digest.hexdigest()


def inspect_bundle(install):
    count = 0
    minimum_versions = []
    for path in install.rglob("*"):
        if path.is_symlink():
            path.resolve().relative_to(install.resolve())
        if not macho(path):
            continue
        if re.match(r"(?:lib)?Qt", path.name) or "RenderingOpenGL" in path.name:
            raise ValueError(f"Unexpected GUI/rendering binary: {path.name}")
        count += 1
        architecture = output("lipo", "-archs", str(path)).strip().split()
        if "arm64" not in architecture:
            raise ValueError(f"Missing arm64 architecture: {path.name}")
        versions = []
        for block in output("otool", "-l", str(path)).split("Load command"):
            if "cmd LC_BUILD_VERSION\n" in block:
                versions += re.findall(r"\bminos ([0-9.]+)", block)
            elif "cmd LC_VERSION_MIN_MACOSX\n" in block:
                versions += re.findall(r"\bversion ([0-9.]+)", block)
        if not versions:
            raise ValueError(f"Missing macOS deployment version: {path.name}")
        minimum_versions.extend(versions)
        for dependency in dependencies(path):
            if dependency.startswith(SYSTEM_PREFIXES) or dependency == "@rpath/" + path.name:
                continue
            if "Qt" in dependency:
                raise ValueError(f"Unexpected Qt library: {path.name}")
            if not dependency.startswith("@loader_path/"):
                raise ValueError(f"Non-relative dependency: {path.name}: {dependency}")
            resolved = (path.parent / dependency[len("@loader_path/"):]).resolve()
            resolved.relative_to(install.resolve())
            if not resolved.is_file():
                raise ValueError(f"Missing bundled dependency: {path.name}: {dependency}")
        if any(value.startswith("/") for value in rpaths(path)):
            raise ValueError(f"Absolute runtime search path: {path.name}")
    if not count:
        raise ValueError("The runtime contains no compiled Mach-O files.")
    minimum = max(minimum_versions, key=lambda value: tuple(map(int, value.split("."))))
    return {
        "machOFiles": count, "externalLibraries": "macOS system only",
        "minimumMacOS": minimum,
    }


def smoke(install, root, case=None, requested_time=1500):
    manifest_path = install / "runtime-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest.pop("smoke", None)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    artifact_hash = fingerprint(install)
    summary = {
        "status": "passed", "artifactSha256": artifact_hash,
        "checks": ["relocated Mach-O dependency closure", "bundled Python and VTK imports",
                   "Python -m execution"],
    }
    # Copying to an unrelated directory exercises the actual distribution layout.
    with tempfile.TemporaryDirectory(prefix="lmbox-paraview-moved-") as temporary:
        moved = Path(temporary) / "runtime"
        shutil.copytree(install, moved, symlinks=True)
        if fingerprint(moved) != artifact_hash:
            raise ValueError("The relocated runtime differs from the packaged artifact.")
        inspect_bundle(moved)
        environment = {
            "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
            "TMPDIR": temporary,
        }
        subprocess.run(
            [str(moved / "bin/vtkpython"), "-c",
             "import os,sys; from pathlib import Path;"
             "root=Path(os.environ['PYTHONHOME']).resolve();"
             "assert Path(sys.prefix).resolve()==root;"
             "from vtkmodules.vtkCommonCore import vtkVersion;"
             "from vtkmodules.vtkFiltersFlowPaths import vtkStreamTracer;"
             "from vtkmodules.vtkIOParallel import vtkPOpenFOAMReader;"
             "assert all(Path(m.__file__).resolve().is_relative_to(root)"
             " for n,m in sys.modules.items() if n.startswith('vtkmodules') and getattr(m,'__file__',None));"
             "print(vtkVersion.GetVTKVersion(), vtkPOpenFOAMReader().GetClassName())"],
            check=True, env=environment,
        )
        subprocess.run(
            [str(moved / "bin/vtkpython"), "-m", "json.tool", "--help"],
            check=True, env=environment, stdout=subprocess.DEVNULL,
        )
        if case:
            result = Path(temporary) / "fields.json"
            subprocess.run(
                [str(moved / "bin/vtkpython"),
                 str(root / "engine/src/lmbox_geometry/modules/cfd/runtime/field_extract.py"),
                 str(case.resolve()), str(result), str(requested_time)],
                check=True, env=environment, timeout=300,
            )
            fields = json.loads(result.read_text())
            if not fields["surface"]["triangles"] or not fields["slice"]["triangles"]:
                raise ValueError("The real case extraction produced no surface or slice.")
            if not fields["streamlines"]["segments"] or not fields["vectors"]["values"]:
                raise ValueError("The real case extraction produced no streamline or vector data.")
            summary["realCase"] = {
                "time": fields["time"],
                "surfaceTriangles": len(fields["surface"]["triangles"]) // 3,
                "sliceTriangles": len(fields["slice"]["triangles"]) // 3,
                "streamlineSegments": len(fields["streamlines"]["segments"]) // 2,
                "fields": [field["id"] for field in fields["fields"]],
            }
            summary["checks"].append("real OpenFOAM surface/slice/streamline/vector extraction")
            print(json.dumps(summary["realCase"]))
    if fingerprint(install) != artifact_hash:
        raise ValueError("The installed runtime changed while smoke testing.")
    manifest["smoke"] = summary
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print("Relocated VTK extraction runtime smoke test passed.")
