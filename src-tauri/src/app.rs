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
