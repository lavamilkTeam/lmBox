//! Gerber import: parse an RS-274X source into the versioned graphics IR.
//!
//! The public entry point is [`parse_gerber`]. Parsing internals stay private
//! inside [`parser`]; other modules must not reach into it.

mod parser;

pub use parser::{parse_gerber, ParseError};

mod import;
pub use import::import_board;
