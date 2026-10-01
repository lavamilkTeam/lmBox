//! lmBox backend crate.
//!
//! This crate currently hosts the `board_import` Gerber parser and the Rust
//! bindings for the cross-language contracts. Tauri commands, project storage
//! and the Python/slicer runtime are not implemented yet.

pub mod contracts;
pub mod features;

pub use features::board_import::parse_gerber;
