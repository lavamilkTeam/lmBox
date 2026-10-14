"""Public stencil operations; implementation packages are module-private."""

from .application import run
from .features.export_2d import export_contours
from .features.export_3d import export_mesh
from .features.inspection import inspect_mesh
from .features.modeling import build_preview

__all__ = ["run", "build_preview", "inspect_mesh", "export_contours", "export_mesh"]
