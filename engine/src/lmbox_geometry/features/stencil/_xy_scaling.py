"""Piecewise affine XY scaling about each edited aperture's bounding-box centre."""

import math

from shapely import affinity
from shapely.geometry import box
from shapely.ops import unary_union

from ._contours import valid


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
    # Clip before scaling, including all ring intersections with the centre line.
    # Independent halves intentionally leave a shoulder at the join.
    upper = g.intersection(box(x0 - 1, cy, x1 + 1, y1 + 1))
    lower = g.intersection(box(x0 - 1, y0 - 1, x1 + 1, cy))
    upper = affinity.scale(upper, sx, sy, origin=(cx, cy))
    if mode == "opposed":
        lower = affinity.scale(lower, 2 - sx, 2 - sy, origin=(cx, cy))
    result = valid(unary_union([upper, lower]))
    if result.geom_type not in ("Polygon", "MultiPolygon"):
        raise ValueError("XY 分区缩放产生退化边缘，请调整比例。")
    before = 1 if g.geom_type == "Polygon" else len(g.geoms)
    after = 1 if result.geom_type == "Polygon" else len(result.geoms)
    if before != after:
        raise ValueError("XY 分区缩放导致开孔合并或分裂，请调整比例。")
    return result
