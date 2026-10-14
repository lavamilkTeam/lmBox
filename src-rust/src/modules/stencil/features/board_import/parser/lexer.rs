use super::error::ParseError;

/// A single record read from the Gerber stream. `offset` is the character
/// index where the record started.
#[derive(Debug, Clone, PartialEq)]
pub struct Record {
    pub offset: usize,
    pub kind: RecordKind,
}

#[derive(Debug, Clone, PartialEq)]
pub enum RecordKind {
    /// A parameter command `%...*%` (or legacy `%...%`), content only.
    Extended(String),
    /// An aperture macro block `%AM<name>*...%`, parsed into primitives.
    Macro {
        name: String,
        primitives: Vec<String>,
    },
    /// A data block, content before the terminating `*`.
    Data(String),
}

/// Splits an RS-274X stream into records. Operates on `char`s so error offsets
/// are character indexes, independent of multi-byte UTF-8.
pub struct Lexer {
    chars: Vec<char>,
    pos: usize,
}

impl Lexer {
    pub fn new(source: &str) -> Self {
        Self {
            chars: source.chars().collect(),
            pos: 0,
        }
    }

    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    fn skip_whitespace(&mut self) {
        while let Some(c) = self.peek() {
            if c.is_whitespace() {
                self.pos += 1;
            } else {
                break;
            }
        }
    }

    /// Reads until one of `stops` is at the cursor, leaving the cursor on the
    /// stop character. Errors at end of file.
    fn read_until(&mut self, stops: &[char]) -> Result<String, ParseError> {
        let mut out = String::new();
        while let Some(c) = self.peek() {
            if stops.contains(&c) {
                return Ok(out);
            }
            out.push(c);
            self.pos += 1;
        }
        Err(ParseError::new(self.pos, "unexpected end of file"))
    }

    pub fn next_record(&mut self) -> Result<Option<Record>, ParseError> {
        self.skip_whitespace();
        let start = self.pos;
        let Some(c) = self.peek() else {
            return Ok(None);
        };

        if c == '%' {
            self.pos += 1; // consume '%'
            let head = self.read_until(&['*', '%'])?;
            match self.peek() {
                Some('*') => {
                    self.pos += 1; // consume '*'
                    let upper = head.to_ascii_uppercase();
                    // `%AM<name>*` opens an aperture macro whose body runs to a
                    // closing `%`.
                    if upper.len() > 2 && upper.starts_with("AM") {
                        let name = head[2..].trim().to_string();
                        if name.is_empty() {
                            return Err(ParseError::new(start, "aperture macro has no name"));
                        }
                        let mut primitives = Vec::new();
                        loop {
                            self.skip_whitespace();
                            if self.peek() == Some('%') {
                                self.pos += 1;
                                break;
                            }
                            let prim = self.read_until(&['*', '%'])?;
                            let trimmed = prim.trim().to_string();
                            if !trimmed.is_empty() {
                                primitives.push(trimmed);
                            }
                            match self.peek() {
                                Some('*') => self.pos += 1,
                                Some('%') => {
                                    self.pos += 1;
                                    break;
                                }
                                _ => {
                                    return Err(ParseError::new(
                                        self.pos,
                                        "unterminated aperture macro",
                                    ))
                                }
                            }
                        }
                        return Ok(Some(Record {
                            offset: start,
                            kind: RecordKind::Macro { name, primitives },
                        }));
                    }
                    // Normal extended command: `%CMD...*%`.
                    match self.peek() {
                        Some('%') => {
                            self.pos += 1;
                            Ok(Some(Record {
                                offset: start,
                                kind: RecordKind::Extended(head),
                            }))
                        }
                        _ => Err(ParseError::new(
                            self.pos,
                            "extended command missing closing '%'",
                        )),
                    }
                }
                Some('%') => {
                    // Legacy parameter command without a leading `*`: `%CMD%`.
                    self.pos += 1;
                    Ok(Some(Record {
                        offset: start,
                        kind: RecordKind::Extended(head),
                    }))
                }
                _ => Err(ParseError::new(self.pos, "unterminated extended command")),
            }
        } else {
            let content = self.read_until(&['*'])?;
            self.pos += 1; // consume '*'
            Ok(Some(Record {
                offset: start,
                kind: RecordKind::Data(content),
            }))
        }
    }
}
