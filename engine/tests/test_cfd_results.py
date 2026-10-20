"""Narrow tests of the private filesystem/process adapter, not solver physics."""

import sys
import time
from types import SimpleNamespace

from lmbox_geometry.modules.cfd.runtime.results import Results


def runtime(tmp_path, running=False):
    case = tmp_path / "output/case"
    (tmp_path / "cache").mkdir()
    (case / "system").mkdir(parents=True)
    (case / "system/controlDict").write_text("endTime 500;")
    solver = SimpleNamespace(
        InputCaseName="case",
        Proxy=SimpleNamespace(
            Type="CfdSolverFoam", solver_process=SimpleNamespace(state=lambda: int(running))
        ),
    )
    r = SimpleNamespace(
        session=tmp_path,
        paraview_executable=None,
        pvpython_executable=None,
        app=SimpleNamespace(ActiveDocument=SimpleNamespace(Name="Fixture", Objects=[solver])),
        tools=SimpleNamespace(
            getParentAnalysisObject=lambda obj: None,
            getOutputPath=lambda analysis: str(tmp_path / "output"),
        ),
    )
    return r, case, solver


def test_running_case_does_not_project_future_or_incomplete_output(tmp_path):
    r, case, _ = runtime(tmp_path, running=True)
    (case / "log.hisa").write_text("Time = 10\n")
    (case / "25").mkdir()
    (case / "25/U").write_text("fixture")
    (case / "25/p").write_text("fixture")
    fields, progress = Results(r).snapshot()
    assert fields == {"status": "unavailable"}
    assert progress == {"stage": "solving", "current": 10, "total": 500}


def test_missing_case_retains_native_mesh_activity(tmp_path):
    r, case, solver = runtime(tmp_path)
    (case / "system/controlDict").unlink()
    solver.Proxy.mesh_process = SimpleNamespace(state=lambda: 1)
    fields, progress = Results(r).snapshot()
    assert fields == {"status": "unavailable"}
    assert progress == {"stage": "meshing", "current": 0, "total": None}


def test_document_case_cannot_leave_session_output(tmp_path):
    r, _, solver = runtime(tmp_path)
    solver.InputCaseName = "../../outside"
    fields, progress = Results(r).snapshot()
    assert fields == {"status": "unavailable"}
    assert progress["stage"] == "idle"


def test_end_marker_reports_run_finished_without_claiming_convergence(tmp_path):
    r, case, _ = runtime(tmp_path)
    (case / "log.hisa").write_text("Time = 500\nResidual: 0.01\nEnd\n")
    fields, progress = Results(r).snapshot()
    assert fields == {"status": "unavailable"}
    assert progress == {"stage": "finished", "current": 500, "total": 500}


def test_configured_vtk_reader_does_not_require_paraview_gui(tmp_path, monkeypatch):
    r, case, _ = runtime(tmp_path)
    for name in ("U", "p"):
        (case / "1").mkdir(exist_ok=True)
        (case / "1" / name).write_text("fixture")
    reader = tmp_path / "vtkpython"
    reader.write_text(
        f"#!{sys.executable}\n"
        "import json,os,pathlib,sys\n"
        "assert 'PYTHONHOME' not in os.environ\n"
        "assert 'PYTHONPATH' not in os.environ\n"
        "pathlib.Path(sys.argv[3]).write_text(json.dumps({'fixture':True}))\n"
    )
    reader.chmod(0o755)
    r.pvpython_executable = str(reader)
    monkeypatch.setenv("PYTHONHOME", "/missing/host")
    monkeypatch.setenv("PYTHONPATH", "/missing/host")
    results = Results(r)
    try:
        assert results.snapshot()[0]["status"] == "loading"
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            fields, _ = results.snapshot()
            if fields["status"] != "loading":
                break
            time.sleep(0.01)
        assert fields["status"] == "ready", fields
        assert fields["data"]["fixture"] is True
    finally:
        results.close()
