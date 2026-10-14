# 二维导出：只接收毫米制轮廓和二维边界，不依赖三维网格、建模或文件系统。
# 2D export: encode millimeter contours and 2D bounds without meshes, modeling or file access.
def export_contours(contours: list, bounds: list, export_format: str) -> str:
    """bounds 为 [[minX, minY], [maxX, maxY]]；返回 SVG/DXF 文本。

    Bounds are [[minX, minY], [maxX, maxY]]; return SVG or DXF text.
    """
    if export_format == "svg":
        return _svg(contours, bounds)
    if export_format == "dxf":
        return _dxf(contours)
    raise ValueError("不支持该二维导出格式。")


def _svg(contours, bounds):
    # SVG 保留毫米尺寸和孔洞，翻转 Y 轴以适配显示坐标系。
    # SVG preserves millimeter dimensions and holes, flipping Y for display coordinates.
    (x0, y0), (x1, y1) = bounds
    path = " ".join(
        "M " + " L ".join(f"{x:.8g},{-y:.8g}" for x, y in r) + " Z" for r in contours
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{x1 - x0}mm" '
        f'height="{y1 - y0}mm" viewBox="{x0} {-y1} {x1 - x0} {y1 - y0}">'
        f'<path d="{path}" fill="black" fill-rule="evenodd"/></svg>'
    )


def _dxf(contours):
    # DXF 以毫米制闭合轻量多段线输出二维轮廓，不包含三维实体。
    # DXF writes closed 2D lightweight polylines in millimeters, without 3D solids.
    lines = [
        "0",
        "SECTION",
        "2",
        "HEADER",
        "9",
        "$ACADVER",
        "1",
        "AC1015",
        "9",
        "$INSUNITS",
        "70",
        "4",
        "0",
        "ENDSEC",
        "0",
        "SECTION",
        "2",
        "ENTITIES",
    ]
    for ring in contours:
        vertices = ring[:-1] if ring[0] == ring[-1] else ring
        lines += [
            "0",
            "LWPOLYLINE",
            "100",
            "AcDbEntity",
            "8",
            "0",
            "100",
            "AcDbPolyline",
            "90",
            str(len(vertices)),
            "70",
            "1",
        ]
        for x, y in vertices:
            lines += ["10", str(x), "20", str(y)]
    return "\n".join([*lines, "0", "ENDSEC", "0", "EOF", ""])
