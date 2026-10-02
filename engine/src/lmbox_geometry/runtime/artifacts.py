"""Only fixed task-local artifacts are readable/writable by the worker."""

import json
from pathlib import Path


def read_input():
    return json.loads(Path("input.json").read_text())


def write_mesh(mesh, summary, export_format=None):
    output = {
        "positions": mesh.positions,
        "indices": mesh.indices,
        "contours": mesh.contours,
        "summary": summary,
        "objects": mesh.objects or [],
    }
    if export_format:
        output["export"] = {
            "format": export_format,
            "content": serialize(mesh, summary, export_format),
        }
    temporary = Path("mesh.json.tmp")
    temporary.write_text(json.dumps(output, allow_nan=False, separators=(",", ":")))
    temporary.replace("mesh.json")


def serialize(mesh, summary, export_format):
    if export_format == "stl":
        import numpy as np
        from trimesh import Trimesh

        model = Trimesh(
            vertices=np.asarray(mesh.positions).reshape(-1, 3),
            faces=np.asarray(mesh.indices).reshape(-1, 3),
            process=False,
        )
        return model.export(file_type="stl_ascii")
    if export_format == "svg":
        x0, y0, _ = summary["bounds"][0]
        x1, y1, _ = summary["bounds"][1]
        path = " ".join(
            "M " + " L ".join(f"{x:.8g},{-y:.8g}" for x, y in r) + " Z" for r in mesh.contours
        )
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{x1 - x0}mm" '
            f'height="{y1 - y0}mm" viewBox="{x0} {-y1} {x1 - x0} {y1 - y0}">'
            f'<path d="{path}" fill="black" fill-rule="evenodd"/></svg>'
        )
    if export_format == "dxf":
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
        for ring in mesh.contours:
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
    raise ValueError("不支持该导出格式。")
