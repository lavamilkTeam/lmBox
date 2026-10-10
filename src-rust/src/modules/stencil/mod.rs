//! Stencil business module. Callers use only this entry point.
mod features;
pub use features::board_import::{import_board, parse_gerber, ParseError};
pub use features::modeling::validate_preview;
#[cfg(not(target_arch = "wasm32"))]
mod app;
#[cfg(not(target_arch = "wasm32"))]
mod runtime;
#[cfg(not(target_arch = "wasm32"))]
pub use app::{build_bundled_preview, build_preview, PreviewTasks};
