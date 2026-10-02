"""Closed board outlines, independent edge margins and corner treatments."""

from shapely.geometry import LineString, Polygon, box
from shapely.ops import polygonize_full, unary_union

from ._contours import compose, disk, path, valid


def board_outline(ir):
    if ir.get("stepAndRepeat"):
        raise ValueError("板框暂不支持步进重复，请导入单板闭合板框。")
    if all(o["kind"] == "stroke" and o["polarity"] == "dark" for o in ir["objects"]):
        lines = [LineString(path(o["start"], o["segments"])) for o in ir["objects"]]
        areas, cuts, dangles, invalid = polygonize_full(unary_union(lines))
        if any(not g.is_empty for g in (cuts, dangles, invalid)) or len(areas.geoms) != 1:
            raise ValueError("板框必须是一条闭合、无分叉的单板轮廓。")
        result = areas.geoms[0]
    else:
        result = compose(ir)
    if result.geom_type != "Polygon" or result.interiors:
        raise ValueError("板框必须是无内孔的单一闭合轮廓。")
    return valid(result)


def frame(ir, settings, outline):
    design = settings.get("design", {})
    board = board_outline(outline) if outline else box(*compose(ir).bounds)
    if design.get("frame") == "outline" and not outline:
        raise ValueError("随形外框需要先选择闭合板框图层。")
    margin = settings["margin"]
    if design.get("frame") == "outline":
        if any(design.get("extra" + side, 0) for side in ("Left", "Right", "Top", "Bottom")):
            raise ValueError("随形外框使用统一边距；独立边宽仅适用于矩形外框。")
        outer = board.buffer(margin, quad_segs=32, join_style="round")
        if any(design.get("corner" + c, 0) for c in ("TL", "TR", "BL", "BR")):
            raise ValueError("四角处理仅适用于矩形外框。")
    else:
        x0, y0, x1, y1 = board.bounds
        x0 -= margin + design.get("extraLeft", 0)
        x1 += margin + design.get("extraRight", 0)
        y0 -= margin + design.get("extraBottom", 0)
        y1 += margin + design.get("extraTop", 0)
        outer = box(x0, y0, x1, y1)
        for name, x, y, sx, sy in [
            ("BL", x0, y0, 1, 1),
            ("BR", x1, y0, -1, 1),
            ("TL", x0, y1, 1, -1),
            ("TR", x1, y1, -1, -1),
        ]:
            r = design.get("corner" + name, 0)
            if not r:
                continue
            if r * 2 >= min(x1 - x0, y1 - y0):
                raise ValueError("外框倒角尺寸过大。")
            if design.get("cornerStyles", {}).get(name, design.get("cornerStyle")) == "chamfer":
                cut = Polygon([(x, y), (x + sx * r, y), (x, y + sy * r)])
            else:
                corner = box(
                    min(x, x + sx * r), min(y, y + sy * r), max(x, x + sx * r), max(y, y + sy * r)
                )
                cut = corner.difference(disk((x + sx * r, y + sy * r), r))
            outer = outer.difference(cut)
    return valid(outer), board
