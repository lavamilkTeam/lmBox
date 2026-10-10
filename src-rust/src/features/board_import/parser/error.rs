use thiserror::Error;

/// A located Gerber parse error. `offset` is the character index into the
/// source where the problem was detected.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
#[error("{message} (at offset {offset})")]
pub struct ParseError {
    pub offset: usize,
    pub message: String,
}

impl ParseError {
    pub fn new(offset: usize, message: impl Into<String>) -> Self {
        Self {
            offset,
            message: message.into(),
        }
    }
}
