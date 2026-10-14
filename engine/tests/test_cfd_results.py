"""Narrow tests of the private filesystem/process adapter, not solver physics."""
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
