//! Rust bindings for the versioned cross-language contracts under
//! `contracts/schemas/v2`. These types are the wire format shared with the
//! frontend and the Python engine.
//!
//! They are hand-maintained for now and must stay in sync with
//! `contracts/schemas/v2/graphics.schema.json`; generated bindings are planned.

pub mod graphics;

pub use graphics::*;

mod import;
pub use import::{ImportResult, ImportedLayer, LayerDiagnostic, LayerRole};
mod preview;
pub use preview::{ModelSettings, PreviewRequest};

pub mod propulsion;
pub mod thermochemistry;
