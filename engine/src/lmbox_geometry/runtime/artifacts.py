"""Only fixed task-local artifacts are readable/writable by the worker."""

import json
from pathlib import Path


def read_input():
    return json.loads(Path("input.json").read_text())


def write_mesh(mesh, summary):
    output = {
        "positions": mesh.positions,
        "indices": mesh.indices,
        "contours": mesh.contours,
        "summary": summary,
    }
    temporary = Path("mesh.json.tmp")
    temporary.write_text(json.dumps(output, allow_nan=False, separators=(",", ":")))
    temporary.replace("mesh.json")
