import copy
import io
import json
from pathlib import Path

import numpy as np
import pytest
from jsonschema import ValidationError
from shapely import affinity
from shapely.geometry import LineString, MultiLineString, Point, Polygon, box
from trimesh import Trimesh, load
from trimesh.intersections import mesh_plane

from lmbox_geometry.contracts import validate_request
from lmbox_geometry.modules.stencil import build_preview, export_mesh, inspect_mesh


@pytest.fixture
def data():
    return json.loads(
        (Path(__file__).resolve().parents[2] / "contracts/fixtures/v1/xy-scaling.json").read_text()
    )


def build(data):
    validate_request(data)
    mesh = build_preview(data["ir"], data["settings"], data["edits"])
    return mesh, inspect_mesh(mesh)


def expected(mode):
    return {
        "off": box(-1, -0.5, 1, 0.5),
        "upper": Polygon([(-1, -0.5), (1, -0.5), (1, 0), (0.8, 0.6), (-0.8, 0.6), (-1, 0)]),
        "whole": box(-0.8, -0.6, 0.8, 0.6),
        "opposed": Polygon([(-1.2, -0.4), (1.2, -0.4), (0.8, 0.6), (-0.8, 0.6)]),
    }[mode]


@pytest.mark.parametrize("mode", ["off", "upper", "whole", "opposed"])
def test_xy_modes_change_real_selected_contour_and_mesh(data, mode):
    data["edits"][0]["optimization"]["xyMode"] = mode
    mesh, summary = build(data)
    shape = expected(mode)
    assert Polygon(mesh.objects[0]["rings"][0]).symmetric_difference(shape).area < 1e-10
    assert Polygon(mesh.objects[1]["rings"][0]).equals(box(5, 3.5, 7, 4.5))
    assert summary["holeCount"] == 2
    assert min(Polygon(r).symmetric_difference(shape).area for r in mesh.contours[1:]) < 1e-10
    assert summary["volume"] == pytest.approx((18 * 15 - shape.area - 2) * 0.2)
    stl = load(io.BytesIO(export_mesh(mesh, "stl").encode()), file_type="stl")
    assert stl.is_watertight
    assert stl.volume == pytest.approx(summary["volume"])
    assert_cross_section(stl, shape)


def assert_cross_section(model, shape):
    lines = mesh_plane(model, [0, 0, 1], [0, 0, 0.1])[:, :, :2]
    # Isolate the aperture near the origin, excluding the frame and the second pad.
    lines = lines[np.all(np.abs(lines) < 3, axis=(1, 2))]
    assert len(lines) > 0
    assert MultiLineString(lines.tolist()).hausdorff_distance(shape.boundary) < 1e-6


@pytest.mark.parametrize("inverse", [False, True])
@pytest.mark.parametrize("mode", ["upper", "whole", "opposed"])
def test_xy_shape_composes_with_both_thickness_tapers_and_stl(data, mode, inverse):
    data["edits"][0]["optimization"].update(xyMode=mode, taper=120, inverseTaper=inverse)
    mesh, summary = build(data)
    shape = expected(mode)
    bottom_scale = 0.8 if inverse else 1
    bottom = affinity.scale(shape, bottom_scale, bottom_scale, origin=shape.centroid)
    assert Polygon(mesh.objects[0]["rings"][0]).symmetric_difference(bottom).area < 1e-10
    middle_scale = 1 if inverse else 1.1
    middle = affinity.scale(shape, middle_scale, middle_scale, origin=shape.centroid)
    native = Trimesh(np.array(mesh.positions).reshape(-1, 3), np.array(mesh.indices).reshape(-1, 3))
    assert_cross_section(native, middle)
    exported = load(io.BytesIO(export_mesh(mesh, "stl").encode()), file_type="stl")
    assert exported.is_watertight and exported.is_winding_consistent
    assert_cross_section(exported, middle)


def test_xy_defaults_rotation_translation_mirror_and_whole_layer(data):
    opt = data["edits"][0]["optimization"]
    del opt["xyScaleX"], opt["xyScaleY"]
    mesh, _ = build(data)
    assert Polygon(mesh.objects[0]["rings"][0]).equals(expected("upper"))
    data["edits"][0].update(rotation=90, dx=1, dy=2)
    mesh, _ = build(data)
    shape = Polygon([(0.5, 1), (1.5, 1), (1.5, 2), (1.4, 3.2), (0.6, 3.2), (0.5, 2)])
    assert Polygon(mesh.objects[0]["rings"][0]).symmetric_difference(shape).area < 1e-10
    data["settings"]["mirror"] = True
    mirrored, _ = build(data)
    axis_sum = min(mesh.positions[::3]) + max(mesh.positions[::3])
    reflected = affinity.translate(affinity.scale(shape, -1, 1, origin=(0, 0)), axis_sum)
    assert Polygon(mirrored.objects[0]["rings"][0]).symmetric_difference(reflected).area < 1e-10
    data["settings"]["mirror"] = False
    data["settings"]["design"]["optimization"] = copy.deepcopy(opt)
    data["edits"] = []
    mesh, _ = build(data)
    assert Polygon(mesh.objects[1]["rings"][0]).symmetric_difference(
        affinity.translate(expected("upper"), 6, 4)
    ).area < 1e-10


@pytest.mark.parametrize("change", [
    {"xyMode": "unknown"}, {"xyScaleX": 0}, {"xyScaleY": 201},
    {"xyMode": "opposed", "xyScaleX": 200}, {"xyMode": "opposed", "xyScaleY": 200},
])
def test_xy_invalid_values_are_rejected_by_contract_and_geometry(data, change):
    data["edits"][0]["optimization"].update(change)
    with pytest.raises(ValidationError):
        validate_request(data)
    with pytest.raises(ValueError, match="XY"):
        build_preview(data["ir"], data["settings"], data["edits"])


def test_xy_collision_is_rejected_and_rounded_pad_retains_lower_half(data):
    data["ir"]["objects"][1]["at"].update(x=0, y=1.05)
    with pytest.raises(ValueError, match="合并"):
        build(data)
    data["ir"]["objects"] = data["ir"]["objects"][:1]
    data["ir"]["apertures"][0]["shape"] = dict(type="obround", width=1, height=3)
    original = copy.deepcopy(data)
    original["edits"] = []
    before, _ = build(original)
    after, _ = build(data)
    lower_half = box(-5, -5, 5, 0)
    lower = Polygon(before.objects[0]["rings"][0]).intersection(lower_half)
    assert Polygon(after.objects[0]["rings"][0]).intersection(lower_half).equals(lower)


def test_obround_sides_slope_continuously_across_the_centre(data):
    data["ir"]["apertures"][0]["shape"] = dict(type="obround", width=1, height=3)
    data["edits"][0]["optimization"]["xyMode"] = "opposed"
    data["settings"]["design"]["optimization"] = data["edits"][0]["optimization"]
    data["edits"] = []
    data["ir"]["objects"] = [
        {**data["ir"]["objects"][0], "at": dict(x=i * 1.8 + 1.234, y=0)} for i in range(7)
    ]
    mesh, summary = build(data)
    assert summary["holeCount"] == 7
    # Straight sides interpolate between virtual endpoint widths 1.2 and 0.8
    # over a total height of 3 mm, with the centre still at Y = 0.
    for obj in mesh.objects:
        shape = Polygon(obj["rings"][0])
        for y in [-0.6, -0.01, 0, 0.01, 0.6, 1]:
            cut = shape.intersection(LineString([(-20, y), (20, y)]))
            assert cut.length == pytest.approx(1.04 - 0.4 * y / 3, abs=1e-9)
        assert shape.bounds[1::2] == pytest.approx((-1.2, 1.8))


def test_oblique_edges_are_subdivided_to_preserve_warped_contours(data):
    data["ir"]["objects"] = data["ir"]["objects"][:1]
    data["ir"]["apertures"][0]["shape"].update(width=2, height=2)
    data["edits"][0].update(rotation=45)
    data["edits"][0]["optimization"].update(xyMode="opposed", xyScaleX=50, xyScaleY=100)
    mesh, _ = build(data)
    shape = Polygon(mesh.objects[0]["rings"][0])
    # A rotated square has diamond sides. The varying X factor bends those
    # oblique edges; mapping only the original vertices would lose that curve.
    radius = 2 ** 0.5
    for y in np.linspace(-radius, radius, 101):
        half_width = (radius - abs(y)) * (1 - y / (2 * radius))
        for x in [-half_width, half_width]:
            assert shape.boundary.distance(Point(x, y)) <= 0.0025
