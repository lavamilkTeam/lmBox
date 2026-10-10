"""Persistent JSONL session coordination; all FreeCAD/Qt work stays on its main thread."""

import json
import os
import queue
import sys
import threading
import traceback
from collections import deque

from .runtime import COMMANDS, Document, Runtime, Widgets, encode

READS = {"initialize", "inspect", "poll"}
MUTATIONS = {
    "command",
    "setField",
    "clickField",
    "editorAccept",
    "editorReject",
    "selectGeometry",
    "selectObject",
    "editObject",
    "setProperty",
    "importFile",
    "exportDocument",
    "setVisibility",
    "deleteObject",
    "undo",
    "redo",
}
OPERATIONS = READS | MUTATIONS | {"dialogResponse", "close"}


class Session:
    def __init__(self, runtime, respond, log, logs):
        self.r = runtime
        self.respond = respond
        self.log = log
        self.logs = logs
        self.document = Document(runtime)
        self.widgets = Widgets(runtime)
        self.revision = 0
        self.pending = None
        self.last_action = None
        self.artifact = None
        self.closing = False

    def snapshot(self):
        commands = []
        for name in COMMANDS:
            command = self.r.command_objects[name]
            resource = command.GetResources()
            try:
                active = bool(command.IsActive())
            except Exception:
                active = False
            descriptor = {
                "id": name,
                "label": resource.get("MenuText", name),
                "tooltip": resource.get("ToolTip", ""),
                "enabled": active,
            }
            if hasattr(command, "GetCommands"):
                descriptor["commands"] = list(command.GetCommands())
            commands.append(descriptor)
        editor, dialogs = self.widgets.snapshot()
        selection = [
            {"objectId": item.ObjectName, "subelements": list(item.SubElementNames)}
            for item in self.r.gui.Selection.getSelectionEx()
        ]
        state = {
            "revision": self.revision,
            "runtime": {"freecadVersion": ".".join(self.r.app.Version()[:3])},
            "capabilities": {
                "nativeControllers": True,
                "nativeTaskPanels": True,
                "geometrySelection": True,
                "dockerConfigured": bool(self.r.docker_image),
                "limitations": [],
            },
            "commands": commands,
            "document": self.document.snapshot(),
            "selection": selection,
            "editor": editor,
            "dialogs": dialogs,
            "geometry": self.document.geometry(),
            "plots": self.plots(),
            "logs": list(self.logs),
            "busy": self.pending is not None,
            "pendingAction": self.pending,
            "lastAction": self.last_action,
        }
        if self.artifact:
            state["artifact"] = self.artifact
            self.artifact = None
        return state

    def plots(self):
        result = []
        doc = self.r.app.ActiveDocument
        if doc is None:
            return result
        for obj in doc.Objects[:256]:
            proxy = getattr(obj, "Proxy", None)
            candidates = []
            for attr in (
                "residual_plotter",
                "forces_plotters",
                "force_coeffs_plotters",
                "probes_plotters",
            ):
                value = getattr(proxy, attr, None)
                candidates.extend(value.values() if isinstance(value, dict) else [value])
            for plot in candidates[:64]:
                if plot is None or not hasattr(plot, "times"):
                    continue
                series = []
                for name, values in list(plot.values.items())[:64]:
                    points = list(zip(plot.times, values))[-2000:]
                    series.append(
                        {"name": str(name), "points": [encode(point) for point in points]}
                    )
                result.append(
                    {
                        "id": f"{obj.Name}/{plot.title}",
                        "title": plot.title,
                        "xLabel": "Time" if plot.transient else "Iteration",
                        "yLabel": plot.y_label,
                        "series": series,
                        "logarithmic": plot.is_logarithmic,
                        "xScale": "linear",
                        "yScale": "log" if plot.is_logarithmic else "linear",
                    }
                )
        return result

    def receive(self, request):
        identifier = request.get("id") if isinstance(request, dict) else None
        try:
            if not isinstance(identifier, str) or not 1 <= len(identifier) <= 256:
                raise ValueError("Request id must be a short string")
            operation = request.get("operation")
            payload = request.get("payload", {})
            if operation not in OPERATIONS or not isinstance(payload, dict):
                raise ValueError("Unsupported operation or payload")
            if operation in READS:
                self.respond({"id": identifier, "ok": True, "state": self.snapshot()})
            elif operation == "close":
                self.respond({"id": identifier, "ok": True, "state": {}})
                self.closing = True
                for dialog in self.r.widgets.QApplication.topLevelWidgets():
                    if isinstance(dialog, self.r.widgets.QDialog):
                        dialog.reject()
                self.r.qt.QTimer.singleShot(0, self.r.qt_app.quit)
            elif operation == "dialogResponse":
                self.respond({"id": identifier, "ok": True, "state": self.snapshot()})
                self.r.qt.QTimer.singleShot(0, lambda: self.dialog_action(payload))
            elif (
                self.pending
                and operation in {"setField", "clickField"}
                and self.widgets.in_dialog(payload.get("fieldId", payload.get("id")))
            ):
                self.respond({"id": identifier, "ok": True, "state": self.snapshot()})
                self.r.qt.QTimer.singleShot(0, lambda: self.dialog_field(operation, payload))
            elif self.pending:
                raise ValueError("A native action is pending; respond to its dialog or poll")
            else:
                self.pending = {"requestId": identifier, "operation": operation}
                self.respond({"id": identifier, "ok": True, "state": self.snapshot()})
                self.r.qt.QTimer.singleShot(0, lambda: self.execute(identifier, operation, payload))
        except Exception as error:
            self.respond({"id": identifier, "ok": False, "state": {}, "error": str(error)})

    def dialog_action(self, payload):
        try:
            self.widgets.dialog_response(payload)
            self.revision += 1
        except Exception as error:
            self.log("error", str(error))

    def dialog_field(self, operation, payload):
        try:
            self.dispatch(operation, payload)
            self.revision += 1
        except Exception as error:
            self.log("error", str(error))

    def execute(self, identifier, operation, payload):
        action = {"requestId": identifier, "operation": operation, "ok": True}
        try:
            self.dispatch(operation, payload)
        except Exception as error:
            action.update(ok=False, error=str(error))
            self.log("error", str(error))
            traceback.print_exc(file=sys.stderr)
        finally:
            self.revision += 1
            self.pending = None
            self.last_action = action

    def dispatch(self, operation, payload):
        if operation == "command":
            self.r.activate_command(payload)
        elif operation == "setField":
            self.widgets.set_field(payload)
        elif operation == "clickField":
            self.widgets.click(payload.get("fieldId", payload.get("id")))
        elif operation in {"editorAccept", "editorReject"}:
            method = "accept" if operation == "editorAccept" else "reject"
            self.r.finish_editor(method)
            if self.r.panel is None:
                self.widgets.registry.clear()
        elif operation in {"selectGeometry", "selectObject"}:
            self.document.select(payload)
        elif operation == "editObject":
            self.document.edit_object(payload)
        elif operation == "setProperty":
            self.document.set_property(payload)
        elif operation == "setVisibility":
            self.document.set_visibility(payload)
        elif operation == "deleteObject":
            self.document.delete_object(payload)
        elif operation in {"undo", "redo"}:
            self.document.history(operation)
        elif operation == "importFile":
            self.document.import_file(payload)
        elif operation == "exportDocument":
            self.artifact = self.document.export_document()
        else:
            raise ValueError("Unsupported mutation")


def run_worker(
    upstream,
    session,
    docker_image=None,
    docker_executable="docker",
    paraview_executable=None,
    container_name=None,
):
    """Run one trusted-host configured session using framed stdin/stdout JSON."""
    protocol = os.fdopen(os.dup(sys.stdout.fileno()), "w", buffering=1, encoding="utf-8")
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    sys.stdout = sys.stderr
    logs = deque(maxlen=200)

    def log(level, message):
        logs.append({"level": level, "text": str(message)[-16000:]})

    def respond(value):
        protocol.write(json.dumps(value, ensure_ascii=False, allow_nan=False) + "\n")
        protocol.flush()

    runtime = Runtime(
        upstream, session, docker_image, docker_executable, log, paraview_executable, container_name
    )
    coordinator = Session(runtime, respond, log, logs)
    requests = queue.Queue(maxsize=64)

    console_methods = {}
    for name, level in (
        ("PrintMessage", "info"),
        ("PrintWarning", "warning"),
        ("PrintError", "error"),
        ("PrintLog", "debug"),
    ):
        original = getattr(runtime.app.Console, name)
        console_methods[name] = original

        def captured(message, native=original, severity=level):
            log(severity, message)
            return native(message)

        setattr(runtime.app.Console, name, captured)

    def reader():
        pending = b""
        while True:
            chunk = os.read(sys.stdin.fileno(), 65536)
            if not chunk:
                requests.put(None)
                return
            pending += chunk
            if len(pending) > 1024 * 1024:
                requests.put({"id": "invalid", "operation": "invalid"})
                requests.put(None)
                return
            while b"\n" in pending:
                line, pending = pending.split(b"\n", 1)
                try:
                    request = json.loads(line)
                except (ValueError, UnicodeError) as error:
                    request = {"id": "invalid", "operation": "invalid", "error": str(error)}
                requests.put(request)

    def drain():
        for _ in range(8):
            try:
                request = requests.get_nowait()
            except queue.Empty:
                break
            if request is None:
                coordinator.receive({"id": "eof", "operation": "close"})
                break
            coordinator.receive(request)

    threading.Thread(target=reader, daemon=True, name="cfd-jsonl-reader").start()
    timer = runtime.qt.QTimer()
    timer.timeout.connect(drain)
    timer.start(20)
    try:
        runtime.qt_app.exec()
    finally:
        timer.stop()
        for name, original in console_methods.items():
            setattr(runtime.app.Console, name, original)
        runtime.close()
        protocol.close()
