"""Only fixed task-local artifacts are readable/writable by the worker."""

import json
from pathlib import Path


def read_input():
    return json.loads(Path("input.json").read_text())


# 文件写入边界：原子发布调用方提供的网格和导出文本，不选择格式或生成几何。
# File boundary: atomically publish supplied mesh and export text; no format selection or modeling.
def write_mesh(mesh, summary, artifact=None):
    output = {
        "positions": mesh.positions,
        "indices": mesh.indices,
        "contours": mesh.contours,
        "summary": summary,
        "objects": mesh.objects or [],
    }
    if artifact is not None:
        output["export"] = artifact
    temporary = Path("mesh.json.tmp")
    temporary.write_text(json.dumps(output, allow_nan=False, separators=(",", ":")))
    temporary.replace("mesh.json")
