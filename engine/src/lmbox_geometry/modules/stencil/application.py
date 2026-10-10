"""Coordinate a single build, topology inspection and artifact publication."""

from lmbox_geometry.contracts import validate_request
from lmbox_geometry.modules.stencil.features.export_2d import export_contours
from lmbox_geometry.modules.stencil.features.export_3d import export_mesh
from lmbox_geometry.modules.stencil.features.inspection import inspect_mesh
from lmbox_geometry.modules.stencil.features.modeling import build_preview
from lmbox_geometry.modules.stencil.runtime.artifacts import read_input, write_mesh


# 单次任务协调：核对输入身份，依次生成、检查和发布模型及可选导出内容。
# Coordinate one task: verify input identity, then build, inspect and publish optional exports.
def run(envelope):
    request = validate_request(read_input())
    identity = ("protocolVersion", "projectId", "jobId", "inputRevision")
    if any(request[key] != envelope.get(key) for key in identity):
        raise ValueError("任务标识不匹配。")
    mesh = build_preview(
        request["ir"], request["settings"], request.get("edits"), request.get("outline")
    )
    summary = inspect_mesh(mesh)
    artifact = None
    export_format = request.get("exportFormat")
    if export_format:
        # 检查通过后按维度选择导出能力；文件写入模块只接收生成好的内容。
        # After inspection, select the exporter; the file adapter receives completed content.
        if export_format == "stl":
            content = export_mesh(mesh, export_format)
        else:
            bounds = [point[:2] for point in summary["bounds"]]
            content = export_contours(mesh.contours, bounds, export_format)
        artifact = {"format": export_format, "content": content}
    write_mesh(mesh, summary, artifact)
    return {**{key: request[key] for key in identity}, "artifact": "mesh.json"}
