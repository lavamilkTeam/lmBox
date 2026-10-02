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


@pytest.mark.parametrize("inverse,lower", [(False, 1.0), (True, 0.8)])
def test_taper_changes_real_mesh_cross_sections_and_export(inverse, lower):
    from shapely.geometry import Polygon
    from trimesh import Trimesh
    from trimesh.intersections import mesh_plane

    data = json.loads(
        (Path(__file__).resolve().parents[2] / "contracts/fixtures/v1/editing.json").read_text()
    )
    data["ir"]["objects"] = data["ir"]["objects"][:1]
    data["edits"] = []
    data["settings"]["design"]["optimization"].update(taper=120, inverseTaper=inverse)
    validate_request(data)
    mesh = build_preview(data["ir"], data["settings"])
    summary = inspect_mesh(mesh)
    assert summary["holeCount"] == 1
    # 2D contours and selectable objects must be the actual contact opening.
    assert Polygon(mesh.contours[1]).area == pytest.approx(2 * lower**2)
    assert Polygon(mesh.objects[0]["rings"][0]).bounds == pytest.approx(
        (-lower, -lower / 2, lower, lower / 2)
    )
    native = Trimesh(
        vertices=np.array(mesh.positions).reshape(-1, 3),
        faces=np.array(mesh.indices).reshape(-1, 3), process=False,
    )
    exported = load(io.BytesIO(serialize(mesh, summary, "stl").encode()), file_type="stl")
    for model in (native, exported):
        assert model.is_watertight
        top = model.vertices[np.isclose(model.vertices[:, 2], 0.2, atol=1e-10)]
        mouth = top[(np.abs(top[:, 0]) < 3) & (np.abs(top[:, 1]) < 3)]
        assert np.ptp(mouth[:, :2], axis=0) == pytest.approx([2.4, 1.2])
        # Slice the triangles at three intermediate heights, independent of
        # display rings: a uniformly enlarged straight hole cannot pass this.
        for fraction in (0.25, 0.5, 0.75):
            lines = mesh_plane(model, plane_origin=[0, 0, 0.2 * fraction], plane_normal=[0, 0, 1])
            points = lines.reshape(-1, 3)
            mouth = points[(np.abs(points[:, 0]) < 3) & (np.abs(points[:, 1]) < 3)]
            assert len(mouth) >= 4
            scale = lower + (1.2 - lower) * fraction
            assert np.ptp(mouth[:, :2], axis=0) == pytest.approx([2 * scale, scale])


def test_inverse_taper_rejects_a_vanishing_contact_opening():
    from jsonschema import ValidationError

    data = json.loads(
        (Path(__file__).resolve().parents[2] / "contracts/fixtures/v1/editing.json").read_text()
    )
    data["settings"]["design"]["optimization"].update(taper=200, inverseTaper=True)
    with pytest.raises(ValidationError):
        validate_request(data)
    with pytest.raises(ValueError, match="下口消失"):
        build_preview(data["ir"], data["settings"])
