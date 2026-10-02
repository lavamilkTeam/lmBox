"""Non-destructive source-instance edits, then ordered exposure composition."""

import math

from shapely import affinity
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

from ._contours import operations, valid

DEFAULT_OPT = dict(
    scale=100,
    rounding=0,
    grid=False,
    gridThreshold=2,
    gridCell=1,
    gridWeb=0.4,
    stagger=False,
    gap=0.55,
    staggerOffset=15,
    staggerShrink=10,
    taper=100,
)


def polygons(g):
    if g.is_empty:
        return []
    if g.geom_type == "Polygon":
        return [g]
    return [p for p in g.geoms if p.geom_type == "Polygon" and p.area > 1e-10]


def rings(g):
    return [list(r.coords) for p in polygons(g) for r in [p.exterior, *p.interiors]]


def offset(g, amount):
    if not amount:
        return g
    parts = polygons(g)
    changed = [p.buffer(amount, quad_segs=32, join_style="mitre") for p in parts]
    if any(p.is_empty for p in changed):
        raise ValueError("补偿导致开孔消失，请减小补偿。")
    result = valid(unary_union(changed))
    if len(polygons(result)) != len(parts):
        raise ValueError("补偿导致开孔合并或分裂，请减小补偿。")
    return result


def optimize(g, opt):
    g = affinity.scale(g, opt["scale"] / 100, opt["scale"] / 100, origin=g.centroid)
    if opt["grid"]:
        parts = []
        for p in polygons(g):
            x0, y0, x1, y1 = p.bounds
            if max(x1 - x0, y1 - y0) < opt["gridThreshold"]:
                parts.append(p)
                continue
            # Equal cells; webs remain connected to the surrounding stencil.
            nx, ny = [
                max(1, math.ceil((d + opt["gridWeb"]) / (opt["gridCell"] + opt["gridWeb"])))
                for d in (x1 - x0, y1 - y0)
            ]
            if nx * ny > 10000:
                raise ValueError("大孔网格过密，请增大网格尺寸。")
            w = (x1 - x0 - (nx - 1) * opt["gridWeb"]) / nx
            h = (y1 - y0 - (ny - 1) * opt["gridWeb"]) / ny
            if min(w, h) < 0.05:
                raise ValueError("网格筋宽过大，无法保留开孔。")
            for iy in range(ny):
                for ix in range(nx):
                    x, y = x0 + ix * (w + opt["gridWeb"]), y0 + iy * (h + opt["gridWeb"])
                    parts.extend(polygons(p.intersection(box(x, y, x + w, y + h))))
        g = valid(unary_union(parts))
    if opt["rounding"]:
        rounded = []
        for p in polygons(g):
            core = p.buffer(-opt["rounding"], quad_segs=32)
            if core.is_empty:
                raise ValueError("圆角半径过大，开孔将消失。")
            rounded.append(core.buffer(opt["rounding"], quad_segs=32))
        g = valid(unary_union(rounded))
    return g


def edited_holes(ir, edits, settings):
    source = operations(ir)
    by_id = {e["id"]: e for e in edits}
    if len(by_id) != len(edits) or not set(by_id).issubset({i for i, _, _ in source}):
        raise ValueError("编辑对象不存在或重复，请重新选择图形。")
    global_opt = settings.get("design", {}).get("optimization", DEFAULT_OPT)
    prepared = []
    for ident, polarity, original in source:
        edit = by_id.get(ident, {})
        if edit and polarity != "dark":
            raise ValueError("清除图形不能作为开孔单独编辑。")
        g = affinity.scale(
            original, edit.get("scaleX", 1), edit.get("scaleY", 1), origin=original.centroid
        )
        g = affinity.rotate(g, edit.get("rotation", 0), origin=original.centroid)
        g = affinity.translate(g, edit.get("dx", 0), edit.get("dy", 0))
        opt = edit.get("optimization", global_opt)
        if polarity == "dark" and not edit.get("deleted"):
            g = offset(g, edit.get("compensation", 0))
            g = affinity.scale(g, opt["scale"] / 100, opt["scale"] / 100, origin=g.centroid)
        prepared.append(
            dict(
                id=ident,
                polarity=polarity,
                geometry=g,
                original=original,
                deleted=edit.get("deleted", False),
                opt=opt,
            )
        )
    # Detect neighbouring eligible rectangular pads, then alternate in a stable spatial order.
    eligible = [o for o in prepared if o["polarity"] == "dark" and not o["deleted"]]
    tree = STRtree([o["geometry"] for o in eligible])
    dense = []
    for i, o in enumerate(eligible):
        g, opt = o["geometry"], o["opt"]
        if not opt["stagger"] or g.geom_type != "Polygon":
            continue
        rect = g.minimum_rotated_rectangle
        if abs(rect.area - g.area) > g.area * 1e-5:
            continue
        neighbours = tree.query(g.buffer(opt["gap"]))
        if any(
            int(j) != i and g.distance(eligible[int(j)]["geometry"]) < opt["gap"]
            for j in neighbours
        ):
            dense.append(o)
    dense.sort(
        key=lambda o: (
            round(o["geometry"].centroid.y, 5),
            round(o["geometry"].centroid.x, 5),
            o["id"],
        )
    )
    for i, o in enumerate(dense):
        g, opt = o["geometry"], o["opt"]
        points = list(g.minimum_rotated_rectangle.exterior.coords)
        dx, dy = max(
            ((b[0] - a[0], b[1] - a[1]) for a, b in zip(points, points[1:])),
            key=lambda p: math.hypot(*p),
        )
        # Canonical direction prevents ring winding from reversing the alternation.
        if dx < 0 or (abs(dx) < 1e-9 and dy < 0):
            dx, dy = -dx, -dy
        factor = opt["staggerOffset"] / 100 * (1 if i % 2 else -1)
        g = affinity.scale(
            g, 1 - opt["staggerShrink"] / 100, 1 - opt["staggerShrink"] / 100, origin=g.centroid
        )
        o["geometry"] = affinity.translate(g, dx * factor, dy * factor)
    for o in eligible:
        o["geometry"] = optimize(o["geometry"], {**o["opt"], "scale": 100})
    visible = []
    for o in prepared:
        if o["deleted"]:
            continue
        if o["polarity"] == "clear":
            for previous in visible:
                previous["geometry"] = previous["geometry"].difference(o["geometry"])
        else:
            visible.append(o)
    visible = [o for o in visible if not o["geometry"].is_empty]
    tree = STRtree([o["geometry"] for o in visible])
    for i, o in enumerate(visible):
        for j in tree.query(o["geometry"]):
            other = visible[int(j)]
            if (
                int(j) > i
                and o["original"].disjoint(other["original"])
                and not o["geometry"].disjoint(other["geometry"])
            ):
                raise ValueError(
                    f"编辑导致开孔合并（{o['id']}、{other['id']}），请减小变换或补偿。"
                )
    holes = unary_union([o["geometry"] for o in visible]) if visible else Polygon()
    if not holes.is_empty:
        # Global offset follows ordered composition; individual overrides precede exposure.
        adjusted = offset(holes, settings["compensation"])
        for o in visible:
            o["geometry"] = offset(o["geometry"], settings["compensation"]).intersection(adjusted)
        holes = adjusted
    objects = [
        dict(id=o["id"], rings=rings(o["geometry"]), deleted=o["deleted"])
        for o in [*visible, *[p for p in prepared if p["deleted"]]]
    ]
    return holes, visible, objects
