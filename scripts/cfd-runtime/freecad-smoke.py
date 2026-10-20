#!/usr/bin/env python3
"""Validate the packaged native FreeCAD modules and the public CFD JSONL worker."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import selectors
import shutil
import subprocess
import tempfile
import time


NATIVE_CHECK = r"""
import json, os, sys
from pathlib import Path
import FreeCAD as App
runtime_root = Path(sys.argv[2]).resolve()
assert Path(App.__file__).resolve().is_relative_to(runtime_root)
assert Path(os.environ["PYTHONHOME"]).resolve() == runtime_root
assert Path(os.environ["QT_PLUGIN_PATH"]).resolve().is_relative_to(runtime_root)
for variable in ("DYLD_LIBRARY_PATH", "DYLD_FALLBACK_LIBRARY_PATH", "QT_QPA_PLATFORM_PLUGIN_PATH"):
    assert variable not in os.environ, variable
notifications = App.ParamGet("User parameter:BaseApp/Preferences/NotificationArea")
notifications.SetBool("NotificationAreaEnabled", False)
notifications.SetBool("NonIntrusiveNotificationsEnabled", False)
from PySide import QtCore, QtWidgets
import FreeCADGui as Gui
Gui.showMainWindow()
Gui.getMainWindow().hide()
import Part, Mesh, MeshPart, Fem
import PySide6, numpy, matplotlib
from FreeCAD.Plot import Plot
from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg
from matplotlib.figure import Figure
from pivy import coin
assert Path(App.getHomePath()).resolve().is_relative_to(runtime_root)
assert Path(App.getResourceDir()).resolve().is_relative_to(runtime_root)
for module in (App, Gui, Part, Mesh, MeshPart, Fem, PySide6, numpy, matplotlib, coin):
    assert Path(module.__file__).resolve().is_relative_to(runtime_root), module.__name__
doc = App.newDocument("RuntimeSmoke")
obj = doc.addObject("Part::Feature", "Box")
obj.Shape = Part.makeBox(10, 20, 30)
doc.recompute()
assert abs(obj.Shape.Volume - 6000) < 1e-8
mesh = MeshPart.meshFromShape(Shape=obj.Shape, LinearDeflection=0.1,
                              AngularDeflection=0.5, Relative=False)
assert mesh.CountFacets > 0
document = str(Path(sys.argv[1]) / "smoke.FCStd")
doc.saveAs(document)
App.closeDocument(doc.Name)
doc = App.openDocument(document)
assert abs(doc.getObject("Box").Shape.Volume - 6000) < 1e-8
App.closeDocument(doc.Name)
canvas = FigureCanvasQTAgg(Figure())
canvas.figure.add_subplot().plot([0, 1], [0, 1])
canvas.draw()
canvas.close()
print("LMBOX_SMOKE=" + json.dumps({"freecadVersion": ".".join(App.Version()[:3]),
    "qtVersion": QtCore.qVersion(), "meshFacets": mesh.CountFacets}))
QtCore.QCoreApplication.sendPostedEvents(None, QtCore.QEvent.DeferredDelete)
QtWidgets.QApplication.instance().processEvents()
Gui.getMainWindow().close()
QtCore.QCoreApplication.sendPostedEvents(None, QtCore.QEvent.DeferredDelete)
QtWidgets.QApplication.instance().processEvents()
QtWidgets.QApplication.instance().quit()
"""


def fingerprint(directory):
    """Bind smoke results to the same content/mode/link receipt as bundle check."""
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


def worker_check(python, upstream, temporary, env):
    session = temporary / "worker"
    log = temporary / "worker.log"
    with log.open("w+") as errors:
        process = subprocess.Popen(
            [str(python), "-m", "lmbox_geometry.cfd_worker",
             "--upstream", str(upstream), "--session", str(session)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=errors,
            bufsize=0, env=env,
        )
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ)
        sequence = 0
        pending = b""

        def error_tail():
            errors.flush()
            errors.seek(0)
            return errors.read()[-6000:]

        def request(operation, payload=None):
            nonlocal sequence, pending
            sequence += 1
            identifier = str(sequence)
            process.stdin.write((json.dumps({
                "id": identifier, "operation": operation, "payload": payload or {},
            }) + "\n").encode())
            process.stdin.flush()
            deadline = time.monotonic() + 90
            while b"\n" not in pending:
                if not selector.select(timeout=max(0, deadline - time.monotonic())):
                    raise RuntimeError(
                        f"CFD worker timed out during {operation} (id {identifier}, "
                        f"{len(pending)} buffered bytes):\n{error_tail()}"
                    )
                chunk = os.read(process.stdout.fileno(), 65536)
                if not chunk:
                    raise RuntimeError(f"CFD worker exited during {operation}:\n{error_tail()}")
                pending += chunk
            line, pending = pending.split(b"\n", 1)
            response = json.loads(line)
            if response.get("id") != identifier or not response.get("ok"):
                raise RuntimeError(f"CFD worker rejected {operation}: {response}")
            return response["state"]

        def mutation(operation, payload):
            state = request(operation, payload)
            deadline = time.monotonic() + 30
            while state.get("busy"):
                if time.monotonic() > deadline:
                    raise RuntimeError(f"CFD native action timed out: {operation}")
                time.sleep(0.05)
                state = request("poll")
            if not state.get("lastAction", {}).get("ok"):
                raise RuntimeError(f"CFD native action failed: {state.get('lastAction')}")
            return state

        try:
            initial = request("initialize")
            commands = {command["id"] for command in initial["commands"]}
            if "CfdOF_Analysis" not in commands or len(commands) < 20:
                raise RuntimeError("CfdOF native commands were not registered.")
            analysis = mutation("command", {"commandId": "CfdOF_Analysis"})
            if len(analysis["document"]["objects"]) < 5:
                raise RuntimeError("CfdOF analysis objects were not created.")
            physics = mutation("command", {"commandId": "CfdOF_PhysicsModel"})
            if not physics.get("editor"):
                raise RuntimeError("The native physics task panel was not projected.")
            mutation("editorReject", {})
            request("close")
            process.wait(timeout=30)
            if process.returncode:
                raise RuntimeError(f"CFD worker exited with {process.returncode}; see {log}")
            return len(commands)
        finally:
            selector.close()
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=10)


def main():
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=root / ".tools/cfd/install/freecad")
    parser.add_argument("--engine", type=Path, default=root / "engine/src")
    parser.add_argument("--upstream", type=Path, default=root / "runtime/cfdof")
    args = parser.parse_args()
    runtime = args.runtime.resolve(strict=True)
    if any(runtime.rglob("*.pyc")):
        raise RuntimeError("The runtime contains generated Python bytecode.")
    artifact_hash = fingerprint(runtime)
    manifest_path = runtime / "runtime-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["smoke"] = {"status": "running"}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    python = runtime / "bin/python3"
    env = os.environ.copy()
    env.update(
        QT_QPA_PLATFORM="offscreen", PYTHONNOUSERSITE="1",
        PYTHONDONTWRITEBYTECODE="1", PYTHONOPTIMIZE="0",
    )
    env["PYTHONPATH"] = str(args.engine.resolve(strict=True))
    # The packaged launcher must override inherited host-runtime settings itself.
    env["PYTHONHOME"] = "/nonexistent/lmbox-host-python"
    env["DYLD_LIBRARY_PATH"] = "/nonexistent/lmbox-host-libraries"
    env["DYLD_FALLBACK_LIBRARY_PATH"] = "/nonexistent/lmbox-host-libraries"
    env["QT_QPA_PLATFORM_PLUGIN_PATH"] = "/nonexistent/lmbox-host-qt"
    with tempfile.TemporaryDirectory(prefix="lmbox-freecad-smoke-") as directory:
        temporary = Path(directory)
        relocated = temporary / "relocated runtime"
        shutil.copytree(runtime, relocated, symlinks=True)
        if fingerprint(relocated) != artifact_hash:
            raise RuntimeError("The relocated runtime differs from the original artifact.")
        python = relocated / "bin/python3"
        for name in ("FREECAD_USER_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "MPLCONFIGDIR"):
            env[name] = str(temporary / name.lower())
            Path(env[name]).mkdir()
        native = subprocess.run(
            [str(python), "-c", NATIVE_CHECK, str(temporary), str(relocated)], env=env,
            text=True, capture_output=True, timeout=120,
        )
        if native.returncode:
            raise RuntimeError(
                f"Native FreeCAD smoke failed ({native.returncode}):\n{native.stdout}\n{native.stderr}"
            )
        marker = next(
            (line.removeprefix("LMBOX_SMOKE=") for line in native.stdout.splitlines()
             if line.startswith("LMBOX_SMOKE=")), None,
        )
        if marker is None:
            raise RuntimeError("Native smoke did not report its geometry checks.")
        details = json.loads(marker)
        lifecycle = subprocess.run(
            [str(python), str(Path(__file__).with_name("freecad-pyside-regression.py"))],
            env=env, text=True, capture_output=True, timeout=120,
        )
        if lifecycle.returncode:
            raise RuntimeError(
                f"Packaged PySide callback regression failed:\n"
                f"{lifecycle.stdout}\n{lifecycle.stderr}"
            )
        details["workerCommandCount"] = worker_check(
            python, args.upstream.resolve(strict=True), temporary, env
        )
        if fingerprint(relocated) != artifact_hash or fingerprint(runtime) != artifact_hash:
            raise RuntimeError("The runtime changed during its smoke checks.")
    manifest["smoke"] = {
        "status": "passed",
        "artifactSha256": artifact_hash,
        "checks": ["native-imports", "cad-volume", "mesh-generation", "fcstd-roundtrip",
                   "qt-matplotlib", "public-jsonl-worker", "cfd-analysis", "native-physics-panel",
                   "pyside-receiver-lifecycle",
                   "host-environment-isolation", "relocated-runtime-and-resource-paths"],
        **details,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest["smoke"], indent=2))


if __name__ == "__main__":
    main()
