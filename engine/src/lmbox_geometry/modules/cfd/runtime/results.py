"""Session-owned, asynchronous native result extraction and factual progress."""

import hashlib
import json
import math
import os
import re
import subprocess
import time
from pathlib import Path


class Results:
    def __init__(self, runtime):
        self.r = runtime
        self.process = None
        self.signature = None
        self.pending_signature = None
        self.data = None
        self.error = None
        self.started = 0
        self.log_file = None
        self.target = self.r.session / "cache/fields.json"

    def close(self):
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=3)
        if self.log_file:
            self.log_file.close()
        self.process = None

    def case(self):
        doc = self.r.app.ActiveDocument
        if not doc:
            return None, None
        for obj in doc.Objects:
            if getattr(getattr(obj, "Proxy", None), "Type", "") == "CfdSolverFoam":
                analysis = self.r.tools.getParentAnalysisObject(obj)
                path = (Path(self.r.tools.getOutputPath(analysis)) / obj.InputCaseName).resolve()
                # Even restored documents cannot grant arbitrary filesystem access.
                try:
                    path.relative_to(self.r.session / "output")
                except ValueError:
                    return None, None
                return path, obj
        return None, None

    def activity(self):
        doc = self.r.app.ActiveDocument
        for obj in doc.Objects if doc else []:
            for attr, stage in (("mesh_process", "meshing"), ("check_mesh_process", "checking")):
                native = getattr(getattr(obj, "Proxy", None), attr, None)
                if native and int(native.state()) != 0:
                    return {"stage": stage, "current": 0, "total": None}
        return None

    def snapshot(self):
        try:
            return self.read_snapshot()
        except (OSError, ValueError, RuntimeError) as error:
            self.close()
            self.data = None
            return {"status": "error", "error": str(error)[:4096]}, {
                "stage": "idle",
                "current": 0,
                "total": None,
            }

    def read_snapshot(self):
        activity = self.activity()
        case, solver = self.case()
        if not case or not (case / "system/controlDict").is_file():
            self.close()
            self.data = None
            self.signature = None
            return {"status": "unavailable"}, activity or {
                "stage": "idle",
                "current": 0,
                "total": None,
            }
        control = (case / "system/controlDict").read_text(errors="replace")[:65536]
        end = re.search(r"\bendTime\s+([\d.eE+-]+)\s*;", control)
        total = float(end.group(1)) if end else None
        total = total if total and math.isfinite(total) and total > 0 else None
        current, finished = 0.0, False
        log = case / "log.hisa"
        if not log.exists():
            logs = sorted(case.glob("log.*"), key=lambda p: p.stat().st_mtime)
            log = logs[-1] if logs else log
        if log.exists():
            with log.open("rb") as stream:
                stream.seek(max(0, log.stat().st_size - 65536))
                tail = stream.read().decode(errors="replace")
            entries = re.findall(r"\bTime\s*=\s*([\d.eE+-]+)", tail)
            if entries:
                current = float(entries[-1])
                current = current if math.isfinite(current) and current >= 0 else 0
            finished = bool(re.search(r"^End\s*$", tail, re.MULTILINE))
        process = getattr(solver.Proxy, "solver_process", None)
        running = bool(process and int(process.state()) != 0)
        progress = {
            "stage": "solving"
            if running
            else "finished"
            if finished
            else "stopped"
            if current
            else "ready",
            "current": current,
            "total": total,
        }
        doc = self.r.app.ActiveDocument
        if activity:
            progress = activity
        directories = case / "processor0" if (case / "processor0").is_dir() else case
        saved = []
        for path in directories.iterdir():
            try:
                step = float(path.name)
            except ValueError:
                continue
            if (
                math.isfinite(step)
                and step > 0
                and (not running or step < current)
                and (path / "U").exists()
                and (path / "p").exists()
            ):
                saved.append((step, path))
        if not saved:
            self.close()
            self.data = None
            self.signature = None
            return {"status": "unavailable"}, progress
        latest, result_dir = max(saved, key=lambda item: item[0])
        inputs = [
            case / name
            for name in ("system/controlDict", "0/U", "0/p", "0/T", "constant/polyMesh/points")
        ]
        inputs.extend(result_dir / name for name in ("U", "p", "T"))
        signature = (
            str(case),
            doc.Name,
            latest,
            tuple(p.stat().st_mtime_ns if p.exists() else 0 for p in inputs),
        )
        if self.process and self.process.poll() is not None:
            code = self.process.returncode
            self.close()
            if self.pending_signature == signature:
                self.signature = signature
                try:
                    if code:
                        raise ValueError("原生流场读取失败，请检查 ParaView 与求解结果")
                    if self.target.stat().st_size > 12 * 1024 * 1024:
                        raise ValueError("流场投影超过 12 MiB 上限")
                    self.data = json.loads(self.target.read_text())
                    self.data["id"] = hashlib.sha256(repr(signature).encode()).hexdigest()
                    self.error = None
                except (OSError, ValueError) as error:
                    self.data = None
                    self.error = str(error)
        if self.process and self.pending_signature != signature:
            self.close()
        if self.signature != signature:
            self.data = None
            if not self.process:
                executable = Path(self.r.paraview_executable or "")
                candidates = [
                    *([Path(self.r.pvpython_executable)] if self.r.pvpython_executable else []),
                    executable.parent / "pvpython",
                    executable.parent.parent / "bin/pvpython",
                ]
                pvpython = next((p for p in candidates if p.is_file()), None)
                if not pvpython:
                    self.signature = signature
                    self.error = "ParaView 的 pvpython 不可用"
                else:
                    self.error = None
                    self.pending_signature = signature
                    self.started = time.monotonic()
                    env = dict(os.environ)
                    for name in (
                        "PYTHONHOME",
                        "PYTHONPATH",
                        "QT_PLUGIN_PATH",
                        "QT_QPA_PLATFORM_PLUGIN_PATH",
                    ):
                        env.pop(name, None)
                    self.log_file = (self.r.session / "cache/fields.log").open("wb")
                    self.process = subprocess.Popen(
                        [
                            str(pvpython),
                            str(Path(__file__).with_name("field_extract.py")),
                            str(case),
                            str(self.target),
                            str(latest),
                        ],
                        stdout=self.log_file,
                        stderr=subprocess.STDOUT,
                        env=env,
                    )
        if self.process and time.monotonic() - self.started > 90:
            self.close()
            self.signature = signature
            self.error = "流场读取超时"
        if self.error:
            return {"status": "error", "error": self.error}, progress
        if self.data:
            return {"status": "ready", "data": self.data}, progress
        return {"status": "loading"}, progress
