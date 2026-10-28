//! Finite arithmetic parser; never evaluates source code or resolves identifiers.
use crate::contracts::ai::AiError;

pub(super) fn calculate(expression: &str) -> Result<f64, AiError> {
    if expression.is_empty() || expression.len() > 4096 || !expression.is_ascii() {
        return Err(invalid());
    }
    let mut parser = Parser {
        input: expression.as_bytes(),
        offset: 0,
        depth: 0,
    };
    let number = parser.sum()?;
    parser.space();
    if parser.offset != parser.input.len() || !number.is_finite() {
        Err(invalid())
    } else {
        Ok(number)
    }
}

struct Parser<'a> {
    input: &'a [u8],
    offset: usize,
    depth: usize,
}
impl Parser<'_> {
    fn space(&mut self) {
        while self
            .input
            .get(self.offset)
            .is_some_and(u8::is_ascii_whitespace)
        {
            self.offset += 1;
        }
    }
    fn token(&mut self, token: &[u8]) -> bool {
        self.space();
        if self.input[self.offset..].starts_with(token) {
            self.offset += token.len();
            true
        } else {
            false
        }
    }
    fn checked(number: f64) -> Result<f64, AiError> {
        if number.is_finite() {
            Ok(number)
        } else {
            Err(invalid())
        }
    }
    fn sum(&mut self) -> Result<f64, AiError> {
        let mut value = self.product()?;
        loop {
            value = if self.token(b"+") {
                Self::checked(value + self.product()?)?
            } else if self.token(b"-") {
                Self::checked(value - self.product()?)?
            } else {
                return Ok(value);
            };
        }
    }
    fn product(&mut self) -> Result<f64, AiError> {
        let mut value = self.unary()?;
        loop {
            value = if self.token(b"//") {
                Self::checked((value / self.unary()?).floor())?
            } else if self.token(b"*") {
                Self::checked(value * self.unary()?)?
            } else if self.token(b"/") {
                Self::checked(value / self.unary()?)?
            } else if self.token(b"%") {
                let divisor = self.unary()?;
                Self::checked(value - (value / divisor).floor() * divisor)?
            } else {
                return Ok(value);
            };
        }
    }
    fn unary(&mut self) -> Result<f64, AiError> {
        self.depth += 1;
        if self.depth > 64 {
            return Err(invalid());
        }
        let value = if self.token(b"+") {
            self.unary()
        } else if self.token(b"-") {
            self.unary().map(|number| -number)
        } else {
            self.power()
        };
        self.depth -= 1;
        value
    }
    fn power(&mut self) -> Result<f64, AiError> {
        let value = self.atom()?;
        if self.token(b"**") {
            let power = self.unary()?;
            if power.abs() > 1024.0 {
                return Err(invalid());
            }
            Self::checked(value.powf(power))
        } else {
            Ok(value)
        }
    }
    fn atom(&mut self) -> Result<f64, AiError> {
        if self.token(b"(") {
            let value = self.sum()?;
            if !self.token(b")") {
                return Err(invalid());
            }
            return Ok(value);
        }
        self.space();
        let start = self.offset;
        while self
            .input
            .get(self.offset)
            .is_some_and(|byte| byte.is_ascii_digit() || *byte == b'.')
        {
            self.offset += 1;
        }
        if self
            .input
            .get(self.offset)
            .is_some_and(|byte| matches!(byte, b'e' | b'E'))
        {
            self.offset += 1;
            if self
                .input
                .get(self.offset)
                .is_some_and(|byte| matches!(byte, b'+' | b'-'))
            {
                self.offset += 1;
            }
            while self.input.get(self.offset).is_some_and(u8::is_ascii_digit) {
                self.offset += 1;
            }
        }
        let value = std::str::from_utf8(&self.input[start..self.offset])
            .map_err(|_| invalid())?
            .parse::<f64>()
            .map_err(|_| invalid())?;
        Self::checked(value)
    }
}
fn invalid() -> AiError {
    AiError::new("invalid_calculation", "仅支持有界、有限值的算术表达式。")
}
