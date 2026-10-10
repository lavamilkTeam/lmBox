import math

from shapely import affinity
from shapely.geometry import LineString, Point, Polygon, box

TOLERANCE = 0.01  # mm, independent of camera and viewport
MAX_POINTS = 200000


def xy(point):
    return point["x"], point["y"]


def segments(radius, angle=2 * math.pi):
    if radius <= 0 or not math.isfinite(radius):
        raise ValueError("圆弧或孔径半径必须为正数。")
    step = 2 * math.acos(max(-1, 1 - min(TOLERANCE, radius) / radius))
    count = max(16, math.ceil(abs(angle) / step))
    if count > MAX_POINTS:
        raise ValueError("圆弧尺寸超出预览限制。")
    return count


def disk(center, radius):
    return Point(center).buffer(radius, quad_segs=math.ceil(segments(radius) / 4))


def path(start, parts):
    points = [xy(start)]
    for part in parts:
        end = xy(part["to"])
        if part["type"] == "line":
            points.append(end)
        else:
            cx, cy = xy(part["center"])
            sx, sy = points[-1]
            radius = math.hypot(sx - cx, sy - cy)
            if abs(math.hypot(end[0] - cx, end[1] - cy) - radius) > TOLERANCE:
                raise ValueError("圆弧起终点半径不一致。")
            a = math.atan2(sy - cy, sx - cx)
            b = math.atan2(end[1] - cy, end[0] - cx)
            sign = 1 if part["direction"] == "counterclockwise" else -1
            sweep = 2 * math.pi if part["fullCircle"] else ((b - a) * sign) % (2 * math.pi)
            count = segments(radius, sweep)
            points.extend(
                (
                    cx + radius * math.cos(a + sign * sweep * i / count),
                    cy + radius * math.sin(a + sign * sweep * i / count),
                )
                for i in range(1, count)
            )
            points.append(end)
        if len(points) > MAX_POINTS:
            raise ValueError("轮廓顶点过多，请拆分图层。")
    return points


def valid(geometry):
    if geometry.is_empty or not geometry.is_valid or geometry.area <= 1e-10:
        raise ValueError("轮廓为空、退化或自相交，无法生成模型。")
    return geometry


def regular(center, diameter, count, rotation):
    radius = diameter / 2
    return Polygon(
        [
            (
                center[0] + radius * math.cos(math.radians(rotation) + i * 2 * math.pi / count),
                center[1] + radius * math.sin(math.radians(rotation) + i * 2 * math.pi / count),
            )
            for i in range(count)
        ]
    )


def primitive(shape):
    kind = shape["type"]
    center = xy(shape.get("center", {"x": 0, "y": 0}))
    if kind == "circle":
        geometry = disk(center, shape["diameter"] / 2)
    elif kind in ("centerLine", "lowerLeftLine"):
        w, h = shape["width"], shape["height"]
        x, y = center if kind == "centerLine" else xy(shape["lowerLeft"])
        if kind == "centerLine":
            x, y = x - w / 2, y - h / 2
        geometry = box(x, y, x + w, y + h)
    elif kind == "vectorLine":
        geometry = LineString([xy(shape["start"]), xy(shape["end"])]).buffer(
            shape["width"] / 2, cap_style="flat"
        )
    elif kind == "outline":
        geometry = Polygon([xy(p) for p in shape["vertices"]])
    elif kind == "polygon":
        geometry = regular(center, shape["diameter"], shape["vertices"], 0)
    elif kind == "thermal":
        outer, inner, gap = shape["outerDiameter"] / 2, shape["innerDiameter"] / 2, shape["gap"]
        if not 0 < inner < outer or not 0 < gap < outer * math.sqrt(2):
            raise ValueError("热焊盘尺寸无效。")
        x, y = center
        geometry = disk(center, outer).difference(disk(center, inner))
        geometry = geometry.difference(box(x - gap / 2, y - outer, x + gap / 2, y + outer))
        geometry = geometry.difference(box(x - outer, y - gap / 2, x + outer, y + gap / 2))
    else:
        raise ValueError("该宏图元暂不支持三维预览。")
    return affinity.rotate(valid(geometry), shape.get("rotationDeg", 0), origin=(0, 0))


def aperture(shape):
    kind = shape["type"]
    if kind == "macro":
        result = Polygon()
        for item in shape["primitives"]:
            part = primitive(item["shape"])
            result = result.union(part) if item["exposure"] == "on" else result.difference(part)
        return valid(result)
    if kind == "circle":
        geometry = disk((0, 0), shape["diameter"] / 2)
    elif kind in ("rectangle", "obround"):
        w, h = shape["width"], shape["height"]
        if kind == "rectangle":
            geometry = box(-w / 2, -h / 2, w / 2, h / 2)
        else:
            radius = min(w, h) / 2
            ends = (
                [(-(w - h) / 2, 0), ((w - h) / 2, 0)]
                if w > h
                else [(0, -(h - w) / 2), (0, (h - w) / 2)]
            )
            geometry = (
                disk((0, 0), radius)
                if w == h
                else LineString(ends).buffer(radius, quad_segs=math.ceil(segments(radius) / 4))
            )
    elif kind == "polygon":
        geometry = regular((0, 0), shape["diameter"], shape["vertices"], shape["rotationDeg"])
    else:
        raise ValueError("该孔径暂不支持三维预览。")
    if shape.get("holeDiameter"):
        geometry = geometry.difference(disk((0, 0), shape["holeDiameter"] / 2))
    return valid(geometry)


def operations(ir):
    shapes = {item["code"]: item["shape"] for item in ir["apertures"]}
    apertures = {code: aperture(shape) for code, shape in shapes.items()}
    repeat = ir.get("stepAndRepeat", {"xCount": 1, "yCount": 1, "xStep": 0, "yStep": 0})
    if repeat["xCount"] * repeat["yCount"] * len(ir["objects"]) > 20000:
        raise ValueError("重复图形过多，请拆分图层。")
    operations = []
    for obj in ir["objects"]:
        try:
            if obj["kind"] == "flash":
                part = affinity.translate(apertures[obj["aperture"]], *xy(obj["at"]))
            elif obj["kind"] == "stroke":
                shape = shapes[obj["aperture"]]
                if shape["type"] != "circle" or shape.get("holeDiameter"):
                    raise ValueError("暂不支持非圆或带孔孔径的描画。")
                radius = shape["diameter"] / 2
                part = LineString(path(obj["start"], obj["segments"])).buffer(
                    radius, quad_segs=math.ceil(segments(radius) / 4)
                )
            else:
                part = Polygon()
                for contour in obj["contours"]:
                    points = path(contour["start"], contour["segments"])
                    if math.dist(points[0], points[-1]) > 1e-7:
                        raise ValueError("区域轮廓未闭合。")
                    part = part.symmetric_difference(valid(Polygon(points)))
            operations.append((obj["polarity"], valid(part)))
        except (ValueError, KeyError) as error:
            raise ValueError(f"图形位置 {obj['sourceOffset']}：{error}") from error
    result = []
    for y in range(repeat["yCount"]):
        for x in range(repeat["xCount"]):
            for index, (polarity, part) in enumerate(operations):
                part = affinity.translate(part, x * repeat["xStep"], y * repeat["yStep"])
                result.append((f"{y}:{x}:{index}", polarity, part))
    return result


def compose(ir):
    result = Polygon()
    for _, polarity, part in operations(ir):
        result = result.union(part) if polarity == "dark" else result.difference(part)
    return valid(result)
