use crate::{contracts::PreviewRequest, features::stencil::validate_preview, runtime::python};
use std::{
    path::Path,
    sync::{atomic::AtomicBool, Arc},
};

pub fn build_preview(
    request: &PreviewRequest,
    root: &Path,
    cancelled: Arc<AtomicBool>,
) -> Result<serde_json::Value, String> {
    validate_preview(request)?;
    python::preview(request, root, cancelled)
}

/// Runs the packaged geometry executable through the same validation and lifecycle.
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
mod thermochemistry;
pub use thermochemistry::{CeaBackend, CeaError};
