use super::{features::modeling::validate_preview, runtime::python};
use crate::contracts::PreviewRequest;
use std::{
    path::Path,
    sync::{atomic::AtomicBool, Arc},
};

// 本地开发建模入口：先校验业务参数，再交给 Python 计算。
// Local development modeling entry: validate business inputs before Python computation.
pub fn build_preview(
    request: &PreviewRequest,
    root: &Path,
    cancelled: Arc<AtomicBool>,
) -> Result<serde_json::Value, String> {
    validate_preview(request)?;
    python::preview(request, root, cancelled)
}

/// 桌面建模入口：复用相同校验和任务生命周期，调用打包的计算引擎。
/// Desktop modeling entry: run the packaged engine with the same validation and lifecycle.
pub fn build_bundled_preview(
    request: &PreviewRequest,
    worker: &Path,
    cancelled: Arc<AtomicBool>,
) -> Result<serde_json::Value, String> {
    validate_preview(request)?;
    python::bundled_preview(request, worker, cancelled)
}

mod preview_tasks;
pub use preview_tasks::PreviewTasks;
