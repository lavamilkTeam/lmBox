import io
import json
from pathlib import Path

import numpy as np
import pytest
from trimesh import load

from lmbox_geometry.contracts import validate_request
from lmbox_geometry.features.inspection import inspect_mesh
from lmbox_geometry.features.stencil import build_preview
from lmbox_geometry.runtime.artifacts import serialize


@pytest.mark.parametrize("mirror", [False, True])
def test_almost_aligned_tapered_openings_keep_valid_faces_through_export(mirror):
    data = json.loads(
        (Path(__file__).resolve().parents[2] / "contracts/fixtures/v1/editing.json").read_text()
    )
    data["edits"] = []
    data["settings"].update(compensation=0.08, mirror=mirror)
    data["settings"]["design"]["optimization"]["taper"] = 101
    # Synthetic pads deliberately straddle float32 coordinate precision. The
    # slight misalignment produces valid thin triangles on the contact plane.
    data["ir"]["objects"] = [
        {
            **data["ir"]["objects"][0],
            "at": {"x": 30 + i * 3, "y": 50 + (1e-6 if i == 1 else 0)},
        }
        for i in range(4)
    ]
    validate_request(data)
    mesh = build_preview(data["ir"], data["settings"])
    summary = inspect_mesh(mesh)
    assert summary["holeCount"] == 4
    assert summary["volume"] == pytest.approx(mesh.expected_volume, rel=1e-12)

    stl = serialize(mesh, summary, "stl")
    exported = load(io.BytesIO(stl.encode()), file_type="stl")
    assert exported.is_watertight
    assert exported.is_winding_consistent
    assert np.all(exported.area_faces > 1e-14)
    assert exported.volume == pytest.approx(summary["volume"], rel=1e-12)
