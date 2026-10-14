import copy
import io
import re
from xml.etree import ElementTree

import pytest
from trimesh import creation, load

from lmbox_geometry.contracts import Mesh
from lmbox_geometry.modules.stencil import export_contours, export_mesh


@pytest.fixture
def mesh():
    box = creation.box(extents=[2, 3, 4])
    box.apply_translation([10, -5, 2])
    return Mesh(
        positions=box.vertices.reshape(-1).tolist(),
        indices=box.faces.reshape(-1).tolist(),
        contours=[],
        area=6,
        thickness=4,
        hole_count=0,
    )


@pytest.fixture
def drawing():
    return [
        [[-2, -1], [4, -1], [4, 3], [-2, 3], [-2, -1]],
        [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]],
    ], [[-2, -1], [4, 3]]


def test_stl_export_preserves_mesh_without_modeling_or_file_writes(mesh, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    before = copy.deepcopy(mesh)
    text = export_mesh(mesh, "stl")
    exported = load(io.BytesIO(text.encode()), file_type="stl")
    assert exported.is_watertight and exported.is_winding_consistent
    assert exported.volume == pytest.approx(24)
    assert exported.bounds.tolist() == [[9, -6.5, 0], [11, -3.5, 4]]
    assert mesh == before
    assert list(tmp_path.iterdir()) == []


def test_svg_preserves_dimensions_holes_and_flips_y_without_a_mesh(drawing):
    contours, bounds = drawing
    before = copy.deepcopy(drawing)
    svg = ElementTree.fromstring(export_contours(contours, bounds, "svg"))
    assert svg.attrib["width"] == "6mm"
    assert svg.attrib["height"] == "4mm"
    assert svg.attrib["viewBox"] == "-2 -3 6 4"
    path = svg.find("{http://www.w3.org/2000/svg}path")
    assert path.attrib["fill-rule"] == "evenodd"
    rings = re.findall(r"M (.*?) Z", path.attrib["d"])
    assert len(rings) == 2
    for ring, expected in zip(rings, contours):
        points = [list(map(float, pair.split(","))) for pair in ring.split(" L ")]
        assert points == [[x, -y] for x, y in expected]
    assert drawing == before


@pytest.mark.parametrize("closed", [False, True])
def test_dxf_preserves_coordinates_units_and_closed_rings_without_a_mesh(drawing, closed):
    contours, bounds = drawing
    if not closed:
        contours = [ring[:-1] for ring in contours]
    before = copy.deepcopy(contours)
    lines = export_contours(contours, bounds, "dxf").splitlines()
    groups = list(zip(lines[::2], lines[1::2]))
    unit = groups.index(("9", "$INSUNITS"))
    assert groups[unit + 1] == ("70", "4")
    entities = []
    current = None
    for code, value in groups:
        if code == "0":
            current = [] if value == "LWPOLYLINE" else None
            if current is not None:
                entities.append(current)
        elif current is not None:
            current.append((code, value))
    assert len(entities) == 2
    for entity, expected in zip(entities, contours):
        assert ("70", "1") in entity
        assert ("90", "4") in entity
        xs = [float(value) for code, value in entity if code == "10"]
        ys = [float(value) for code, value in entity if code == "20"]
        assert [list(point) for point in zip(xs, ys)] == expected[:4]
    assert contours == before


@pytest.mark.parametrize("export_format", ["svg", "dxf", "dwg", "step"])
def test_3d_export_rejects_unsupported_formats(mesh, export_format):
    with pytest.raises(ValueError, match="三维导出格式"):
        export_mesh(mesh, export_format)


@pytest.mark.parametrize("export_format", ["stl", "dwg", "step"])
def test_2d_export_rejects_unsupported_formats(drawing, export_format):
    with pytest.raises(ValueError, match="二维导出格式"):
        export_contours(*drawing, export_format)
