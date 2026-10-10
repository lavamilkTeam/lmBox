//! lmBox backend crate.
//!
//! Business modules expose narrow public entries for stencil and propulsion.
//! Numerical geometry is delegated to Python, propulsion calculations to Fortran.
//! Project persistence, STEP export and slicer integration are not implemented.

pub mod contracts;
pub mod modules;

pub use modules::stencil::parse_gerber;

#[cfg(target_arch = "wasm32")]
mod browser;

#[cfg(not(target_arch = "wasm32"))]
pub mod app;
