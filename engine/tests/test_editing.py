import copy
import io
import json
from pathlib import Path
from xml.etree import ElementTree

import numpy as np
import pytest
from jsonschema import ValidationError
from shapely.geometry import Polygon
from trimesh import load

from lmbox_geometry.contracts import validate_request
from lmbox_geometry.features.inspection import inspect_mesh
from lmbox_geometry.features.stencil import build_preview
from lmbox_geometry.runtime.artifacts import serialize


@pytest.fixture
def data():
    return json.loads(
        (Path(__file__).resolve().parents[2] / "contracts/fixtures/v1/editing.json").read_text()
    )


def build(data):
    validate_request(data)
    mesh = build_preview(data["ir"], data["settings"], data.get("edits"), data.get("outline"))
    return mesh, inspect_mesh(mesh)


def test_instance_edit_delete_restore_and_mirror(data):
    original = copy.deepcopy(data)
    data["ir"]["stepAndRepeat"] = dict(xCount=2, yCount=2, xStep=20, yStep=20)
    data["edits"][0].update(id="1:0:0", dx=1, dy=2, scaleX=1.2, rotation=90)
    mesh, summary = build(data)
    assert summary["holeCount"] == 8
    obj = next(o for o in mesh.objects if o["id"] == "1:0:0")
    pad = Polygon(obj["rings"][0])
    assert tuple(pad.centroid.coords)[0] == pytest.approx((1, 22))
    assert pad.area == pytest.approx(2.4)
    data["edits"][0]["deleted"] = True
    assert build(data)[1]["holeCount"] == 7
    data["edits"] = []
    assert build(data)[1]["holeCount"] == 8
    data = original
    data["settings"]["design"]["extraLeft"] = 2
    unmirrored = build(data)[0]
    data["settings"]["mirror"] = True
    mirrored = build(data)[0]
    left, right = min(unmirrored.positions[::3]), max(unmirrored.positions[::3])
    assert Polygon(mirrored.objects[0]["rings"][0]).centroid.x == pytest.approx(left + right)


def test_grid_rounding_and_local_override(data):
    base, _ = build(data)
    opt = data["settings"]["design"]["optimization"]
    opt.update(grid=True, gridThreshold=1, gridCell=0.5, gridWeb=0.2)
    mesh, summary = build(data)
    assert summary["holeCount"] > 2
    assert summary["volume"] > inspect_mesh(base)["volume"]
    opt["grid"] = False
    opt["rounding"] = 0.15
    rounded, summary = build(data)
    assert len(rounded.contours[1]) > 5
    data["edits"][0]["optimization"] = {**opt, "scale": 50, "rounding": 0}
    local, _ = build(data)
    assert Polygon(local.objects[0]["rings"][0]).area == pytest.approx(0.5)
    assert Polygon(local.objects[1]["rings"][0]).area > 1.9


def test_dense_pads_stagger_before_rounding(data):
    ir = data["ir"]
    ir["apertures"][0]["shape"].update(width=0.5, height=3)
    ir["objects"] = [{**ir["objects"][0], "at": {"x": i * 0.8, "y": 0}} for i in range(4)]
    data["settings"]["design"]["optimization"].update(stagger=True, rounding=0.05)
    mesh, summary = build(data)
    assert summary["holeCount"] == 4
    centers = [Polygon(o["rings"][0]).centroid.y for o in mesh.objects]
    assert centers == pytest.approx([-0.45, 0.45, -0.45, 0.45])


def test_taper_is_watertight_and_has_real_sloped_walls(data):
    initial, initial_summary = build(data)
    data["settings"]["design"]["optimization"]["taper"] = 150
    mesh, summary = build(data)
    assert summary["volume"] == pytest.approx(
        initial_summary["volume"] - 4 * 0.2 * ((1 + 1.5 + 2.25) / 3 - 1), rel=1e-5
    )
    # Contact-plane contours stay invariant; top mouths are actually larger.
    assert Polygon(mesh.contours[1]).area == pytest.approx(Polygon(initial.contours[1]).area)
    vertices = np.array(mesh.positions).reshape(-1, 3)
    assert any(abs(x - 1.5) < 1e-5 and abs(z - 0.2) < 1e-5 for x, _, z in vertices)
    data["edits"][0]["dx"] = 6
    data["edits"][0]["dy"] = 4
    with pytest.raises(ValueError, match="合并"):
        build(data)


def test_closed_outline_base_slot_and_chamfer(data):
    outline = copy.deepcopy(data["ir"])
    outline["objects"] = [
        dict(
            kind="stroke",
            polarity="dark",
            aperture=10,
            sourceOffset=0,
            start=dict(x=-2, y=-2),
            segments=[
                dict(type="line", to=dict(x=x, y=y))
                for x, y in [(9, -2), (9, 7), (-2, 7), (-2, -2)]
            ],
        )
    ]
    outline["apertures"][0]["shape"] = dict(type="circle", diameter=0.1)
    data["outline"] = outline
    design = data["settings"]["design"]
    design.update(kind="base", floor=1, boardThickness=1.6, clearance=0.2)
    mesh, summary = build(data)
    assert summary["bounds"][1][2] == pytest.approx(2.6)
    expected = 21 * 19 * 2.6 - 11.4 * 9.4 * 1.6
    assert summary["volume"] == pytest.approx(expected, rel=1e-5)
    design.update(slotWidth=3, chamfer=0.4, cornerTL=2, cornerBR=1)
    assert build(data)[1]["volume"] < summary["volume"]
    design.update(frame="outline", cornerTL=0, cornerBR=0)
    assert build(data)[1]["volume"] > 0
    outline["objects"][0]["segments"].pop()
    with pytest.raises(ValueError, match="闭合"):
        build(data)


def test_export_round_trip_and_invalid_settings(data):
    mesh, summary = build(data)
    stl = serialize(mesh, summary, "stl")
    model = load(io.BytesIO(stl.encode()), file_type="stl")
    assert model.is_watertight
    assert model.volume == pytest.approx(summary["volume"])
    svg = ElementTree.fromstring(serialize(mesh, summary, "svg"))
    assert svg.attrib["width"].endswith("mm")
    dxf = serialize(mesh, summary, "dxf")
    assert dxf.count("LWPOLYLINE") == len(mesh.contours)
    invalid = copy.deepcopy(data)
    invalid["settings"]["design"]["optimization"]["gridWeb"] = 0
    with pytest.raises(ValidationError):
        validate_request(invalid)
    invalid = copy.deepcopy(data)
    invalid["edits"][0]["id"] = "0:0:999"
    with pytest.raises(ValueError, match="不存在"):
        build(invalid)
    data["settings"]["design"]["optimization"]["rounding"] = 1
    with pytest.raises(ValueError, match="半径过大"):
        build(data)


def test_grid_cells_receive_rounding_and_base_export_contains_slot(data):
    opt = data["settings"]["design"]["optimization"]
    opt.update(grid=True, gridCell=0.5, gridWeb=0.2, rounding=0.05)
    mesh, _ = build(data)
    assert all(len(r) > 5 for r in mesh.objects[0]["rings"])
    opt.update(grid=False, rounding=0)
    design = data["settings"]["design"]
    design.update(kind="base", slotWidth=1, chamfer=0.2)
    mesh, summary = build(data)
    # The slot opens the rim into a single contour instead of a closed interior ring.
    assert len(mesh.contours) == 1
    assert summary["holeCount"] == 0
    assert summary["algorithmVersion"] == "0.2.4"


def test_each_corner_can_choose_round_or_chamfer(data):
    design = data["settings"]["design"]
    design.update(
        cornerTL=2, cornerTR=2, cornerStyles=dict(TL="round", TR="chamfer", BL="round", BR="round")
    )
    _, summary = build(data)
    design["cornerStyles"]["TL"] = "chamfer"
    _, changed = build(data)
    assert changed["volume"] < summary["volume"]
