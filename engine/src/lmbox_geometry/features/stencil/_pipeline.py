from shapely import affinity
from shapely.geometry import box
from trimesh.creation import extrude_polygon

from lmbox_geometry.contracts import Mesh

from ._contours import TOLERANCE, compose, valid


def polygons(geometry):
    return list(geometry.geoms) if geometry.geom_type == "MultiPolygon" else [geometry]


def build_preview(ir, settings):
    holes = compose(ir)
    minx, miny, maxx, maxy = holes.bounds
    margin = settings["margin"]
    base = box(minx - margin, miny - margin, maxx + margin, maxy + margin)
    compensation = settings["compensation"]
    if compensation:
        parts = polygons(holes)
        adjusted = [p.buffer(compensation, quad_segs=32, join_style="mitre") for p in parts]
        if any(p.is_empty for p in adjusted):
            raise ValueError("补偿导致开孔消失，请减小补偿。")
        holes = valid(holes.buffer(compensation, quad_segs=32, join_style="mitre"))
        if len(polygons(holes)) != len(parts):
            raise ValueError("补偿导致开孔合并或分裂，请减小补偿。")
    if not base.contains(holes):
        raise ValueError("开孔超出模板边界，请增加边距。")
    material = valid(base.difference(holes))
    if material.geom_type != "Polygon":
        raise ValueError("模板包含悬空孤岛，无法形成连通模板。请检查孔径内孔及图层极性。")
    if settings["mirror"]:
        material = affinity.scale(material, xfact=-1, yfact=1, origin=base.centroid)
    thickness = settings["thickness"]
    mesh = extrude_polygon(material, height=thickness, engine="earcut")
    if len(mesh.faces) > 500000:
        raise ValueError("模型过大，请拆分图层。")
    contours = [list(material.exterior.coords)] + [list(r.coords) for r in material.interiors]
    return Mesh(
        mesh.vertices.reshape(-1).tolist(),
        mesh.faces.reshape(-1).tolist(),
        contours,
        material.area,
        thickness,
        len(material.interiors),
    )


__all__ = ["build_preview", "TOLERANCE"]
