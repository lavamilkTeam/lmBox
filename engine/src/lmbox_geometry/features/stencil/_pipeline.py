from shapely import affinity
from shapely.geometry import Polygon
from trimesh.creation import extrude_polygon

from lmbox_geometry.contracts import Mesh

from ._contours import TOLERANCE, valid
from ._editing import edited_holes, rings
from ._frame import frame
from ._solid import base_solid, stencil_solid


def build_preview(ir, settings, edits=None, outline=None):
    outer, board = frame(ir, settings, outline)
    holes, visible, objects = edited_holes(ir, edits or [], settings)
    if not holes.is_empty and not outer.contains(holes):
        raise ValueError("开孔超出模板边界，请增加边距或调整位置。")
    material = valid(outer.difference(holes))
    if material.geom_type != "Polygon":
        raise ValueError("模板包含悬空孤岛，无法形成连通模板。请检查孔径内孔及图层极性。")
    design = settings.get("design", {})
    is_base = design.get("kind") == "base"
    thickness = settings["thickness"]
    expected_volume = None
    if is_base or any(o["opt"]["taper"] != 100 for o in visible):
        solid = (
            base_solid(outer, board, design)
            if is_base
            else stencil_solid(outer, holes, visible, thickness)
        )
        if solid.is_empty() or len(solid.decompose()) != 1:
            raise ValueError("模型为空或含分离实体，请检查开孔和边框。")
        expected_volume = solid.volume()
        # Keep the kernel's precision: float32 can collapse thin valid triangles
        # between almost aligned openings, even at ordinary board coordinates.
        raw = solid.to_mesh64()
        vertices, faces = raw.vert_properties[:, :3].astype(float), raw.tri_verts.astype(int)
        if is_base:
            # Export the actual top rim, including the slot and extraction bevel.
            # Slice just inside the top: Manifold's top boundary itself is empty.
            material = Polygon()
            height = design["floor"] + design["boardThickness"]
            for ring in solid.slice(height - 1e-6).to_polygons():
                material = material.symmetric_difference(Polygon(ring))
    else:
        mesh = extrude_polygon(material, height=thickness, engine="earcut")
        vertices, faces = mesh.vertices, mesh.faces
    if settings["mirror"]:
        cx = (outer.bounds[0] + outer.bounds[2]) / 2
        vertices[:, 0] = 2 * cx - vertices[:, 0]
        faces = faces[:, ::-1]
        material = affinity.scale(material, xfact=-1, yfact=1, origin=(cx, 0))
        for obj in objects:
            obj["rings"] = [[[2 * cx - x, y] for x, y in ring] for ring in obj["rings"]]
    if len(faces) > 500000:
        raise ValueError("模型过大，请拆分图层。")
    return Mesh(
        vertices.reshape(-1).tolist(),
        faces.reshape(-1).tolist(),
        rings(material),
        material.area,
        thickness,
        0 if is_base else len(material.interiors),
        expected_volume,
        objects,
    )


__all__ = ["build_preview", "TOLERANCE"]
