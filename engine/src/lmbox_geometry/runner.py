"""Coordinate a single build, topology inspection and artifact publication."""

from lmbox_geometry.contracts import validate_request
from lmbox_geometry.features.inspection import inspect_mesh
from lmbox_geometry.features.stencil import build_preview
from lmbox_geometry.runtime.artifacts import read_input, write_mesh


def run(envelope):
    request = validate_request(read_input())
    identity = ("protocolVersion", "projectId", "jobId", "inputRevision")
    if any(request[key] != envelope.get(key) for key in identity):
        raise ValueError("任务标识不匹配。")
    mesh = build_preview(request["ir"], request["settings"])
    summary = inspect_mesh(mesh)
    write_mesh(mesh, summary)
    return {**{key: request[key] for key in identity}, "artifact": "mesh.json"}
