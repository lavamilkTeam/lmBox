"""Validate mesh topology and dimensions without depending on the generator."""

import math

import numpy as np
from trimesh import Trimesh


def inspect_mesh(data):
    mesh = Trimesh(
        vertices=np.asarray(data.positions).reshape(-1, 3),
        faces=np.asarray(data.indices).reshape(-1, 3),
        process=False,
    )
    if not np.isfinite(mesh.vertices).all() or not mesh.is_watertight:
        raise ValueError("模型网格未闭合或含无效坐标。")
    if not mesh.is_winding_consistent or np.any(mesh.area_faces <= 1e-14):
        raise ValueError("模型法向或三角面无效。")
    if not math.isclose(mesh.volume, data.area * data.thickness, rel_tol=1e-6):
        raise ValueError("模型体积校验失败。")
    return {
        "bounds": mesh.bounds.tolist(),
        "volume": float(mesh.volume),
        "holeCount": data.hole_count,
        "triangleCount": len(mesh.faces),
        "tolerance": 0.01,
        "unit": "mm",
    }
