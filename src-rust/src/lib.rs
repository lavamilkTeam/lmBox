//! lmBox backend crate.
//!
//! This crate currently hosts the `board_import` Gerber parser and the Rust
//! bindings and a local Python preview task runner. Project
//! persistence, STEP export and slicer integration are not implemented yet.

pub mod contracts;
pub mod features;

pub use features::board_import::parse_gerber;

#[cfg(target_arch = "wasm32")]
mod browser;

#[cfg(not(target_arch = "wasm32"))]
pub mod app;
#[cfg(not(target_arch = "wasm32"))]
mod runtime;
