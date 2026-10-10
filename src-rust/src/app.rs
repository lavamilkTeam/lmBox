//! Stable host facade; implementation belongs to the owning business module.

pub use crate::modules::propulsion::{CeaBackend, CeaError, DesignError, PropulsionBackend};
pub use crate::modules::stencil::{build_bundled_preview, build_preview, PreviewTasks};
