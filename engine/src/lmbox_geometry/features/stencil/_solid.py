"""Watertight variable-height solids; no renderer-side manufacturing geometry."""

import manifold3d as m
import numpy as np
from shapely import affinity
from shapely.geometry import box
from shapely.ops import unary_union

from ._editing import polygons, rings


def section(g):
    return m.CrossSection(
        [np.array(r[:-1], dtype=np.float64) for r in rings(g)], m.FillRule.EvenOdd
    )


def loft(g, height, scale=1, z=0):
    center = g.centroid
    local = affinity.translate(g, -center.x, -center.y)
    return (
        section(local).extrude(height, scale_top=(scale, scale)).translate((center.x, center.y, z))
    )


def opening_sections(holes, visible):
    sections, contact_objects = [], {o["id"]: [] for o in visible}
    for p in polygons(holes):
        owners = [
            o
            for o in visible
            if o["geometry"].intersects(p) and o["geometry"].intersection(p).area > 1e-10
        ]
        scales = {(o["opt"]["taper"] / 100, o["opt"].get("inverseTaper", False)) for o in owners}
        if len(scales) > 1:
            raise ValueError("相连开孔的喇叭口比例不一致，请分开或统一参数。")
        scale, inverse = next(iter(scales), (1, False))
        lower = 2 - scale if inverse else 1
        if lower <= 0:
            raise ValueError("反比缩放会使下口消失，喇叭口比例必须小于 200%。")
        bottom = affinity.scale(p, lower, lower, origin=p.centroid) if inverse else p
        top = affinity.scale(p, scale, scale, origin=p.centroid)
        sections.append((bottom, top, scale / lower))
        for o in owners:
            piece = o["geometry"].intersection(p)
            contact_objects[o["id"]].append(
                affinity.scale(piece, lower, lower, origin=p.centroid) if inverse else piece
            )
    return sections, {ident: unary_union(parts) for ident, parts in contact_objects.items()}


def stencil_solid(outer, sections, thickness):
    cutters = [loft(bottom, thickness, ratio) for bottom, _, ratio in sections]
    tops = [top for _, top, _ in sections]
    expanded = unary_union(tops)
    if not expanded.is_empty and (
        not outer.contains(expanded) or len(polygons(expanded)) != len(tops)
    ):
        raise ValueError("喇叭孔合并或超出边框，请减小喇叭口比例。")
    solid = section(outer).extrude(thickness)
    if cutters:
        solid = m.Manifold.batch_boolean([solid, *cutters], m.OpType.Subtract)
    return solid


def base_solid(outer, board, design):
    floor, depth = design["floor"], design["boardThickness"]
    pocket = board.buffer(design["clearance"], quad_segs=32, join_style="mitre")
    if not outer.contains(pocket):
        raise ValueError("PCB 定位槽超出底板，请增加外框边距。")
    chamfer = design["chamfer"]
    if chamfer >= depth:
        raise ValueError("取件斜口高度必须小于 PCB 厚度。")
    solid = section(outer).extrude(floor + depth)
    cutters = [loft(pocket, depth - chamfer, z=floor)]
    if chamfer:
        x0, y0, x1, y1 = pocket.bounds
        scale = 1 + 2 * chamfer / min(x1 - x0, y1 - y0)
        top = affinity.scale(pocket, scale, scale, origin=pocket.centroid)
        if not outer.contains(top):
            raise ValueError("取件斜口超出底板，请增加边距或减小斜口。")
        cutters.append(loft(pocket, chamfer, scale, floor + depth - chamfer))
    if design["slotWidth"]:
        x0, y0, x1, y1 = outer.bounds
        cy = pocket.centroid.y
        if design["slotWidth"] >= y1 - y0:
            raise ValueError("卸板槽过宽。")
        slot = box(
            pocket.centroid.x, cy - design["slotWidth"] / 2, x1 + 1, cy + design["slotWidth"] / 2
        )
        cutters.append(loft(slot, depth, z=floor))
    return m.Manifold.batch_boolean([solid, *cutters], m.OpType.Subtract)
