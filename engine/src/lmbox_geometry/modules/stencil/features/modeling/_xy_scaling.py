"""Continuous planar taper about each edited aperture's bounding-box centre."""

import math

from shapely import affinity
from shapely.geometry import MultiPolygon, Polygon

from ._contours import MAX_POINTS, TOLERANCE, valid


def scale_xy(g, opt):
    mode = opt.get("xyMode", "off")
    sx, sy = opt.get("xyScaleX", 80) / 100, opt.get("xyScaleY", 120) / 100
    if (
        mode not in ("off", "upper", "whole", "opposed")
        or not all(math.isfinite(s) and 0.1 <= s <= 2 for s in (sx, sy))
        or (mode == "opposed" and max(sx, sy) >= 2)
    ):
        raise ValueError("XY 缩放参数无效；上下反向变化的比例必须小于 200%。")
    if mode == "off" or (sx == 1 and sy == 1):
        return g
    x0, y0, x1, y1 = g.bounds
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    if mode == "whole":
        return valid(affinity.scale(g, sx, sy, origin=(cx, cy)))
    lower_y_scale = 2 - sy if mode == "opposed" else 1
    bottom, top = cy + (y0 - cy) * lower_y_scale, cy + (y1 - cy) * sy

    def warp(point):
        x, y = point
        yy = cy + (y - cy) * (sy if y >= cy else lower_y_scale)
        if mode == "upper":
            factor = 1 + (sx - 1) * max(0, (yy - cy) / (top - cy))
        else:
            # Interpolate in the stretched Y coordinate so vertical source sides
            # remain single straight sloping sides, even when half lengths differ.
            factor = 2 - sx + (2 * sx - 2) * (yy - bottom) / (top - bottom)
        return (cx + (x - cx) * factor, yy)

    count = 0

    def warp_ring(ring):
        nonlocal count
        points = [warp(ring.coords[0])]

        def append_segment(a, b):
            nonlocal count
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            pa, pb, pm = warp(a), warp(b), warp(mid)
            # Within each half the mapped segment is quadratic. Midpoint error
            # bounds its deviation; subdivision keeps oblique edges within tolerance.
            error = math.hypot(pm[0] - (pa[0] + pb[0]) / 2, pm[1] - (pa[1] + pb[1]) / 2)
            if error > TOLERANCE / 4:
                append_segment(a, mid)
                append_segment(mid, b)
            else:
                count += 1
                if count > MAX_POINTS:
                    raise ValueError("XY 渐变轮廓顶点过多，请拆分图层或减小缩放。")
                points.append(pb)

        coords = list(ring.coords)
        for a, b in zip(coords, coords[1:]):
            crosses = (a[1] < cy < b[1]) or (b[1] < cy < a[1])
            # Rotation can leave a vertex a few ulps from the centre line.
            # Do not create an almost duplicate intersection beside that vertex.
            if crosses and min(abs(a[1] - cy), abs(b[1] - cy)) > 1e-12:
                t = (cy - a[1]) / (b[1] - a[1])
                centre = (a[0] + t * (b[0] - a[0]), cy)
                append_segment(a, centre)
                append_segment(centre, b)
            else:
                append_segment(a, b)
        return points

    parts = [g] if g.geom_type == "Polygon" else list(g.geoms)
    mapped = [Polygon(warp_ring(p.exterior), [warp_ring(r) for r in p.interiors]) for p in parts]
    result = valid(mapped[0] if len(mapped) == 1 else MultiPolygon(mapped))
    # The centre intersection on a straight tapered side is now redundant.
    # Remove collinear round-off (<= 1e-12 mm) before triangulation, which would
    # otherwise turn these almost collinear triples into zero-area triangles.
    return valid(result.simplify(1e-12, preserve_topology=True))
