import numpy as np
from trimesh import Trimesh

from lmbox_geometry.contracts import Mesh


# 三维导出：接收调用方已检查的网格，返回文件内容，不重新建模或写盘。
# 3D export: encode a caller-inspected mesh without rebuilding geometry or writing files.
def export_mesh(mesh: Mesh, export_format: str) -> str:
    """输出毫米坐标的 ASCII STL；DWG/STEP 尚未实现。 Export ASCII STL in mm."""
    if export_format != "stl":
        raise ValueError("不支持该三维导出格式。")
    model = Trimesh(
        vertices=np.asarray(mesh.positions).reshape(-1, 3),
        faces=np.asarray(mesh.indices).reshape(-1, 3),
        process=False,
    )
    return model.export(file_type="stl_ascii")
