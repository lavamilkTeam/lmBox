import copy
import json
import math
import os
import subprocess
import sys
from pathlib import Path

import pytest
from jsonschema import ValidationError
from shapely.geometry import Polygon

from lmbox_geometry.contracts import validate_request
from lmbox_geometry.features.inspection import inspect_mesh
from lmbox_geometry.features.stencil import build_preview

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def request_data():
    return json.loads((ROOT / "contracts/fixtures/v1/preview.json").read_text())


def build(data):
    validate_request(data)
    mesh = build_preview(data["ir"], data["settings"])
    return mesh, inspect_mesh(mesh)


def test_dimensions_holes_volume_and_reproducibility(request_data):
    mesh, summary = build(request_data)
    assert summary["bounds"] == [[-6, -5.5, 0], [12, 9.5, 0.2]]
    assert summary["holeCount"] == 2
    assert summary["volume"] == pytest.approx((18 * 15 - 4) * 0.2)
    assert build(request_data)[1] == summary
    assert len(mesh.contours) == 3


def test_thickness_compensation_and_mirror(request_data):
    initial, summary = build(request_data)
    request_data["settings"].update(thickness=0.8, compensation=0.1, mirror=True)
    mesh, changed = build(request_data)
    assert changed["bounds"][1][2] == 0.8
    assert changed["volume"] < summary["volume"] * 4
    original = sorted(Polygon(ring).centroid.x for ring in initial.contours[1:])
    mirrored = sorted(Polygon(ring).centroid.x for ring in mesh.contours[1:])
    assert mirrored == pytest.approx(sorted(6 - x for x in original))


def test_modal_polarity_order_and_macro_cutouts(request_data):
    ir = request_data["ir"]
    ir["objects"] = ir["objects"][:1]
    ir["apertures"].append({"code": 11, "shape": {"type": "rectangle", "width": 1, "height": 1}})
    clear = {**ir["objects"][0], "polarity": "clear", "aperture": 11, "at": {"x": 0.75, "y": 0}}
    ir["objects"].append(clear)
    _, partial = build(request_data)
    ir["objects"].append({**clear, "polarity": "dark"})
    _, filled = build(request_data)
    assert filled["volume"] != partial["volume"]
    ir["apertures"][0]["shape"] = {
        "type": "macro",
        "name": "CUT",
        "primitives": [
            {
                "exposure": "on",
                "shape": {
                    "type": "centerLine",
                    "width": 2,
                    "height": 1,
                    "center": {"x": 0, "y": 0},
                },
            },
            {
                "exposure": "off",
                "shape": {"type": "circle", "diameter": 1, "center": {"x": 1, "y": 0}},
            },
        ],
    }
    ir["objects"] = ir["objects"][:1]
    assert build(request_data)[1]["holeCount"] == 1


def test_arc_region_repeat_and_inches_already_normalized(request_data):
    ir = request_data["ir"]
    ir["apertures"] = [{"code": 10, "shape": {"type": "circle", "diameter": 0.5}}]
    ir["objects"] = [
        {
            "kind": "stroke",
            "polarity": "dark",
            "aperture": 10,
            "sourceOffset": 0,
            "start": {"x": 2, "y": 0},
            "segments": [
                {
                    "type": "arc",
                    "to": {"x": 0, "y": 2},
                    "center": {"x": 0, "y": 0},
                    "direction": "counterclockwise",
                    "fullCircle": False,
                }
            ],
        }
    ]
    ir["stepAndRepeat"] = {"xCount": 2, "yCount": 1, "xStep": 10, "yStep": 0}
    assert build(request_data)[1]["holeCount"] == 2
    ir.pop("stepAndRepeat")
    ir["objects"] = [
        {
            "kind": "region",
            "polarity": "dark",
            "sourceOffset": 0,
            "contours": [
                {
                    "start": {"x": 2, "y": 0},
                    "segments": [
                        {
                            "type": "arc",
                            "to": {"x": 2, "y": 0},
                            "center": {"x": 0, "y": 0},
                            "direction": "clockwise",
                            "fullCircle": True,
                        }
                    ],
                }
            ],
        }
    ]
    ir["source"]["originalUnit"] = "IN"
    mesh, _ = build(request_data)
    assert Polygon(mesh.contours[1]).area == pytest.approx(math.pi * 4, abs=0.15)


def test_invalid_geometry_is_not_silently_repaired(request_data):
    request_data["settings"]["compensation"] = -0.3
    request_data["ir"]["apertures"][0]["shape"]["height"] = 0.2
    with pytest.raises(ValueError, match="消失"):
        build(request_data)
    request_data["settings"]["compensation"] = 0
    request_data["ir"]["apertures"][0]["shape"] = {
        "type": "circle",
        "diameter": 2,
        "holeDiameter": 1,
    }
    with pytest.raises(ValueError, match="孤岛"):
        build(request_data)


def test_merging_holes_and_corrupt_mesh_are_rejected(request_data):
    request_data["ir"]["objects"][1]["at"] = {"x": 2.1, "y": 0}
    request_data["settings"]["compensation"] = 0.1
    with pytest.raises(ValueError, match="合并"):
        build(request_data)
    request_data["settings"]["compensation"] = 0
    mesh, _ = build(request_data)
    mesh.indices = mesh.indices[3:]
    with pytest.raises(ValueError, match="未闭合"):
        inspect_mesh(mesh)


def test_contract_and_jsonl_artifact_protocol(request_data, tmp_path):
    invalid = copy.deepcopy(request_data)
    invalid["protocolVersion"] = "9"
    with pytest.raises(ValidationError):
        validate_request(invalid)
    (tmp_path / "input.json").write_text(json.dumps(request_data))
    envelope = {
        k: request_data[k] for k in ("protocolVersion", "projectId", "jobId", "inputRevision")
    }
    env = {**os.environ, "PYTHONPATH": str(ROOT / "engine/src")}
    result = subprocess.run(
        [sys.executable, "-m", "lmbox_geometry"],
        cwd=tmp_path,
        env=env,
        input=json.dumps(envelope) + "\n",
        text=True,
        capture_output=True,
        check=True,
    )
    reply = json.loads(result.stdout)
    assert reply == {**envelope, "artifact": "mesh.json"}
    assert json.loads((tmp_path / reply["artifact"]).read_text())["summary"]["holeCount"] == 2
    envelope["jobId"] = "stale"
    result = subprocess.run(
        [sys.executable, "-m", "lmbox_geometry"],
        cwd=tmp_path,
        env=env,
        input=json.dumps(envelope) + "\n",
        text=True,
        capture_output=True,
        check=True,
    )
    assert "不匹配" in json.loads(result.stdout)["error"]
