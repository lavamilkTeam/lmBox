//! Private parsing internals for `board_import`. The stable entry point is
//! [`parse_gerber`]; everything else here is an implementation detail.

mod aperture;
mod error;
mod expression;
mod format;
mod lexer;
mod state;

pub use error::ParseError;

use crate::contracts::GraphicsIr;
use state::State;

/// Parses an RS-274X Gerber layer into the versioned graphics IR, normalizing
/// lengths to millimetres and preserving polarity, drawing order, arcs and
/// evaluated aperture-macro primitives.
pub fn parse_gerber(source: &str) -> Result<GraphicsIr, ParseError> {
    State::parse(source)
}
