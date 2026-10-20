#!/usr/bin/env python3
"""Exercise a relocated CFD bundle through native public process entrypoints."""

import argparse
import hashlib
import json
import math
import os
import selectors
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin"
MAX_FRAME = 36 * 1024 * 1024


def stop(process):
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        process.wait(timeout=10)
        return
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait(timeout=10)


def log_tail(path):
    with path.open("rb") as stream:
        stream.seek(max(0, path.stat().st_size - 6000))
        return stream.read().decode("utf-8", errors="replace")


def run(arguments, environment, directory, label, timeout=600):
    """Keep native output off the JSON report channel and bound child lifetime."""
    print("Checking " + label, file=sys.stderr, flush=True)
    log = directory / (label + ".log")
    with log.open("wb") as stream:
        process = subprocess.Popen(
            [str(value) for value in arguments],
            cwd=directory,
            env=environment,
            stdin=subprocess.DEVNULL,
            stdout=stream,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        try:
            try:
                code = process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                raise RuntimeError(label + " timed out")
            if code:
                raise RuntimeError("{} failed ({}):\n{}".format(label, code, log_tail(log)))
        finally:
            stop(process)


def clean_environment(directory):
    paths = {
        "HOME": "home",
        "TMPDIR": "tmp",
        "TMP": "tmp",
        "TEMP": "tmp",
        "FREECAD_USER_HOME": "profile",
        "XDG_CONFIG_HOME": "config",
        "XDG_CACHE_HOME": "cache",
        "MPLCONFIGDIR": "matplotlib",
    }
    environment = {
        "PATH": SYSTEM_PATH,
        "LANG": "C",
        "LC_ALL": "C",
        "PYTHONUTF8": "1",
        "PYTHONNOUSERSITE": "1",
        "PYTHONDONTWRITEBYTECODE": "1",
        "QT_QPA_PLATFORM": "offscreen",
    }
    for name, folder in paths.items():
        path = directory / folder
        path.mkdir(exist_ok=True)
        environment[name] = str(path)
    return environment


class Worker:
    """One JSONL client; the worker remains the owner of native CFD behavior."""

    def __init__(self, bundle, upstream, engine, directory, environment):
        self.log = directory / "worker.log"
        self.errors = self.log.open("wb")
        self.selector = selectors.DefaultSelector()
        self.sequence = 0
        self.buffer = bytearray()
        env = dict(environment, PYTHONPATH=str(engine))
        try:
            self.process = subprocess.Popen(
                [
                    str(bundle / "freecad/bin/python3"),
                    "-u",
                    "-m",
                    "lmbox_geometry.cfd_worker",
                    "--upstream",
                    str(upstream),
                    "--session",
                    str(directory / "worker"),
                    "--pvpython-executable",
                    str(bundle / "paraview/bin/vtkpython"),
                    "--openfoam-directory",
                    str(bundle / "openfoam"),
                ],
                cwd=directory,
                env=env,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=self.errors,
                bufsize=0,
                start_new_session=True,
            )
            self.selector.register(self.process.stdout, selectors.EVENT_READ)
        except BaseException:
            if hasattr(self, "process"):
                stop(self.process)
            self.selector.close()
            self.errors.close()
            raise

    def request(self, operation, payload=None):
        self.sequence += 1
        identifier = str(self.sequence)
        packet = (
            json.dumps(
                {
                    "id": identifier,
                    "operation": operation,
                    "payload": payload or {},
                }
            ).encode("utf-8")
            + b"\n"
        )
        self.process.stdin.write(packet)
        self.process.stdin.flush()
        deadline = time.monotonic() + 120
        while b"\n" not in self.buffer:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not self.selector.select(timeout=remaining):
                raise RuntimeError("CFD worker timed out during " + operation)
            chunk = os.read(self.process.stdout.fileno(), 65536)
            if not chunk:
                raise RuntimeError(
                    "CFD worker exited during {}:\n{}".format(operation, log_tail(self.log))
                )
            self.buffer.extend(chunk)
            if len(self.buffer) > MAX_FRAME:
                raise RuntimeError("CFD worker exceeded its JSONL frame limit")
        line, _, rest = self.buffer.partition(b"\n")
        self.buffer = bytearray(rest)
        response = json.loads(line)
        if not isinstance(response, dict) or response.get("id") != identifier:
            raise RuntimeError("CFD worker returned an uncorrelated response")
        if response.get("ok") is not True:
            raise RuntimeError(
                "CFD worker rejected {}: {}".format(operation, response.get("error"))
            )
        state = response.get("state")
        if not isinstance(state, dict):
            raise RuntimeError("CFD worker did not return a state object")
        return state

    def mutation(self, operation, payload=None):
        state = self.request(operation, payload)
        identifier = str(self.sequence)
        deadline = time.monotonic() + 60
        while state.get("busy"):
            if time.monotonic() >= deadline:
                raise RuntimeError("CFD native action timed out: " + operation)
            time.sleep(0.05)
            state = self.request("poll")
        action = state.get("lastAction") or {}
        if action.get("requestId") != identifier or action.get("ok") is not True:
            raise RuntimeError("CFD native action failed: {}".format(action))
        return state

    def close(self):
        self.selector.close()
        stop(self.process)
        self.process.stdin.close()
        self.process.stdout.close()
        self.errors.close()


def worker_check(bundle, upstream, engine, directory, environment):
    print("Checking public CFD JSONL session", file=sys.stderr, flush=True)
    worker = Worker(bundle, upstream, engine, directory, environment)
    try:
        initial = worker.request("initialize")
        if initial.get("capabilities", {}).get("dockerConfigured") is not False:
            raise RuntimeError("The local runtime unexpectedly configured Docker")
        version = initial.get("runtime", {}).get("freecadVersion")
        if not isinstance(version, str) or not version:
            raise RuntimeError("The worker did not identify its FreeCAD runtime")
        commands = {command["id"] for command in initial.get("commands", [])}
        required_commands = {"CfdOF_Analysis", "CfdOF_PhysicsModel", "CfdOF_SolverControl"}
        if len(commands) < 20 or not required_commands <= commands:
            raise RuntimeError("Native CfdOF commands are missing")
        analysis = worker.mutation("command", {"commandId": "CfdOF_Analysis"})
        objects = analysis.get("document", {}).get("objects", [])
        if len(objects) < 5:
            raise RuntimeError("The native CFD analysis objects were not created")
        physics = worker.mutation("command", {"commandId": "CfdOF_PhysicsModel"})
        if not physics.get("editor"):
            raise RuntimeError("The native physics task panel was not projected")
        state = worker.mutation("editorReject")
        solver_command = next(
            (
                command
                for command in state.get("commands", [])
                if command.get("id") == "CfdOF_SolverControl"
            ),
            None,
        )
        if not solver_command or solver_command.get("enabled") is not True:
            raise RuntimeError("Native solver-control prerequisites are not satisfied")
        solver = worker.mutation("command", {"commandId": "CfdOF_SolverControl"})
        if not solver.get("editor"):
            raise RuntimeError(
                "The native solver-control panel was not projected; prerequisites may be missing"
            )
        pending = [solver["editor"]]
        paraview_buttons = []
        while pending:
            value = pending.pop()
            if isinstance(value, dict):
                if value.get("kind") == "button" and "paraview" in value.get("name", "").lower():
                    paraview_buttons.append(value)
                pending.extend(value.values())
            elif isinstance(value, list):
                pending.extend(value)
        if not paraview_buttons:
            raise RuntimeError("The native solver panel did not expose its ParaView button")
        if any(button.get("enabled") is not False for button in paraview_buttons):
            raise RuntimeError("The VTK-only runtime exposed an enabled ParaView GUI button")
        worker.mutation("editorReject")
        worker.request("close")
        worker.process.wait(timeout=30)
        if worker.process.returncode != 0:
            raise RuntimeError(
                "The CFD worker did not close successfully:\n" + log_tail(worker.log)
            )
        return {
            "freecadVersion": version,
            "commandCount": len(commands),
            "analysisObjectCount": len(objects),
            "physicsPanel": True,
            "dockerConfigured": False,
            "closed": True,
            "solverPanel": True,
            "disabledParaviewButtons": len(paraview_buttons),
        }
    finally:
        worker.close()


def finite_numbers(values):
    return isinstance(values, list) and all(
        isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)
        for value in values
    )


def extraction_check(path):
    fields = json.loads(path.read_text())
    if fields.get("coordinateUnit") != "m" or abs(fields.get("time", -1) - 0.5) > 1e-9:
        raise RuntimeError("VTK did not extract the newly solved cavity time")
    names = {field["id"] for field in fields.get("fields", [])}
    if not {"p", "U"} <= names:
        raise RuntimeError("VTK output is missing pressure or velocity")
    counts = {}
    for name in ("surface", "slice"):
        layer = fields.get(name, {})
        vertices, triangles = layer.get("vertices"), layer.get("triangles")
        if not vertices or not finite_numbers(vertices) or len(vertices) % 3:
            raise RuntimeError("VTK output has no valid " + name + " vertices")
        points = len(vertices) // 3
        if (
            not triangles
            or len(triangles) % 3
            or any(type(index) is not int or not 0 <= index < points for index in triangles)
        ):
            raise RuntimeError("VTK output has no valid " + name + " triangles")
        for field in ("p", "U"):
            values = layer.get("fields", {}).get(field)
            if not finite_numbers(values) or len(values) != points:
                raise RuntimeError("VTK output has incomplete {} {}".format(name, field))
        counts[name + "Triangles"] = len(triangles) // 3
    vectors = fields.get("vectors", {})
    positions, values = vectors.get("positions"), vectors.get("values")
    if (
        not positions
        or not finite_numbers(positions)
        or len(positions) % 3
        or not finite_numbers(values)
        or len(values) != len(positions)
        or not any(abs(value) > 1e-12 for value in values)
    ):
        raise RuntimeError("VTK output has no finite, nonzero velocity vectors")
    return {
        "time": fields["time"],
        "fields": sorted(names),
        **counts,
        "velocityVectors": len(values) // 3,
        # The existing extractor's external seeds do not enter a closed cavity.
        # Record its real output without requiring or inventing streamlines.
        "streamlineSegments": len(fields.get("streamlines", {}).get("segments", [])) // 2,
    }


def sanitize(message, paths):
    for path, replacement in sorted(paths, key=lambda pair: len(str(pair[0])), reverse=True):
        message = message.replace(str(path), replacement)
    return message


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", required=True, type=Path)
    parser.add_argument("--upstream", type=Path, default=ROOT / "runtime/cfdof")
    parser.add_argument("--engine", type=Path, default=ROOT / "engine/src")
    parser.add_argument("--output", type=Path, help="Also save the JSON summary to this file")
    args = parser.parse_args()
    report = {"schemaVersion": 1, "status": "failed", "checks": []}
    redactions = [(ROOT, "<project>"), (Path.home(), "<home>")]
    for value, label in (
        (args.bundle, "<bundle>"),
        (args.upstream, "<upstream>"),
        (args.engine, "<engine>"),
        (args.output, "<report>"),
    ):
        if value:
            redactions.append((value.absolute(), label))
    output = args.output
    try:
        bundle = args.bundle.resolve(strict=True)
        upstream = args.upstream.resolve(strict=True)
        engine = args.engine.resolve(strict=True)
        redactions.extend([(bundle, "<bundle>"), (upstream, "<upstream>"), (engine, "<engine>")])
        if output and (output.resolve() == bundle or bundle in output.resolve().parents):
            output = None
            raise ValueError("The report must be outside the input bundle")
        if not (upstream / "CfdOF/CfdTools.py").is_file():
            raise ValueError("The supplied CfdOF upstream directory is incomplete")
        extractor = engine / "lmbox_geometry/modules/cfd/runtime/field_extract.py"
        if not (engine / "lmbox_geometry/cfd_worker.py").is_file() or not extractor.is_file():
            raise ValueError("The supplied engine directory is incomplete")
        with tempfile.TemporaryDirectory(prefix="lmbox-cfd-acceptance-") as temporary:
            directory = Path(temporary).resolve()
            redactions.append((directory, "<temporary>"))
            moved = directory / "relocated runtime"
            print("Copying the complete CFD bundle", file=sys.stderr, flush=True)
            shutil.copytree(bundle, moved, symlinks=True)
            environment = clean_environment(directory)
            checker = ROOT / "scripts/bundle-cfd-runtime.py"
            run([sys.executable, "-B", checker, "check", moved], environment, directory, "bundle")
            manifest_bytes = (moved / "bundle.json").read_bytes()
            manifest = json.loads(manifest_bytes)
            report.update(
                {
                    "target": manifest["target"],
                    "minimumMacOS": manifest["minimumMacOS"],
                    "bundleManifestSha256": hashlib.sha256(manifest_bytes).hexdigest(),
                    "sourceCommits": {
                        name: value["sourceCommit"]
                        for name, value in manifest["components"].items()
                    },
                }
            )
            report["checks"].append("relocated-bundle-integrity-and-native-dependencies")
            report["worker"] = worker_check(moved, upstream, engine, directory, environment)
            report["checks"].append("public-jsonl-analysis-physics-close-with-local-runtime")
            report["checks"].append("native-solver-panel-disables-paraview-gui")
            solver_output = directory / "solver"
            run(
                [
                    sys.executable,
                    "-B",
                    ROOT / "scripts/cfd-runtime/openfoam-smoke.py",
                    "--prefix",
                    moved / "openfoam",
                    "--output",
                    solver_output,
                    "--parallel",
                    "4",
                    "--extensions",
                ],
                environment,
                directory,
                "cavity",
            )
            solver = json.loads((solver_output / "smoke.json").read_text())
            checks = solver.get("checks", [])
            cavity = checks[0] if checks else {}
            if (
                solver.get("status") != "passed"
                or len(checks) != 3
                or any(item.get("status") != "passed" for item in checks)
                or cavity.get("cells") != 400
                or cavity.get("processes") != 4
                or not {"blockMesh", "checkMesh", "icoFoam", "decomposePar",
                        "mpiexec", "reconstructPar"} <= set(cavity.get("commands", []))
                or "cartesianMesh" not in checks[1].get("commands", [])
                or "hisa" not in checks[2].get("commands", [])
            ):
                raise RuntimeError("The OpenFOAM CLI did not complete parallel cavity, cfMesh and HiSA")
            report["openfoam"] = solver
            report["checks"].append("four-process-scotch-icoFoam-cavity-and-reconstruction")
            report["checks"].append("native-cfmesh-and-hisa-calculations")
            cases = [path for path in solver_output.glob("cavity-*") if path.is_dir()]
            if len(cases) != 1:
                raise RuntimeError("The OpenFOAM CLI did not produce exactly one new case")
            result = directory / "fields.json"
            run(
                [
                    moved / "paraview/bin/vtkpython",
                    extractor,
                    cases[0],
                    result,
                    "0.5",
                ],
                environment,
                directory,
                "vtk-fields",
                timeout=300,
            )
            report["vtk"] = extraction_check(result)
            report["checks"].append("new-cavity-surface-slice-pressure-and-velocity")
            run(
                [sys.executable, "-B", checker, "check", moved],
                environment,
                directory,
                "unchanged-bundle",
            )
            report["checks"].append("runtime-unchanged-after-execution")
            report["status"] = "passed"
    except (
        OSError,
        ValueError,
        KeyError,
        TypeError,
        RuntimeError,
        subprocess.TimeoutExpired,
    ) as error:
        report["error"] = sanitize(str(error), redactions)
    text = json.dumps(report, indent=2, allow_nan=False) + "\n"
    if output:
        try:
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(text)
        except OSError as error:
            report["status"] = "failed"
            report["error"] = "Cannot write test summary: " + sanitize(str(error), redactions)
            text = json.dumps(report, indent=2, allow_nan=False) + "\n"
    print(text, end="")
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
