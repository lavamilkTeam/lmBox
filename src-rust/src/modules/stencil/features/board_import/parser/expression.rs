//! Arithmetic evaluator for aperture-macro parameters.
//!
//! Operators are `+`, `-`, `x`/`X` (multiply), `/`, with parentheses. `*` is
//! *not* multiplication here — it terminates a macro primitive. Variables are
//! `$1`..`$n`, indexed into the `%ADD%` parameter list.

/// Evaluates `expr` with `$k` resolving to `params[k - 1]`.
pub fn eval(expr: &str, params: &[f64]) -> Result<f64, String> {
    let mut parser = Parser {
        chars: expr.chars().collect(),
        pos: 0,
        params,
    };
    let value = parser.parse_expr()?;
    parser.skip_ws();
    if parser.peek().is_some() {
        return Err(format!("unexpected trailing input in expression {expr:?}"));
    }
    Ok(value)
}

struct Parser<'a> {
    chars: Vec<char>,
    pos: usize,
    params: &'a [f64],
}

impl Parser<'_> {
    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    fn bump(&mut self) -> Option<char> {
        let c = self.peek();
        if c.is_some() {
            self.pos += 1;
        }
        c
    }

    fn skip_ws(&mut self) {
        while let Some(c) = self.peek() {
            if c.is_whitespace() {
                self.pos += 1;
            } else {
                break;
            }
        }
    }

    fn parse_expr(&mut self) -> Result<f64, String> {
        let mut lhs = self.parse_term()?;
        loop {
            self.skip_ws();
            match self.peek() {
                Some('+') => {
                    self.bump();
                    lhs += self.parse_term()?;
                }
                Some('-') => {
                    self.bump();
                    lhs -= self.parse_term()?;
                }
                _ => break,
            }
        }
        Ok(lhs)
    }

    fn parse_term(&mut self) -> Result<f64, String> {
        let mut lhs = self.parse_factor()?;
        loop {
            self.skip_ws();
            match self.peek() {
                Some('x') | Some('X') => {
                    self.bump();
                    lhs *= self.parse_factor()?;
                }
                Some('/') => {
                    self.bump();
                    lhs /= self.parse_factor()?;
                }
                _ => break,
            }
        }
        Ok(lhs)
    }

    fn parse_factor(&mut self) -> Result<f64, String> {
        self.skip_ws();
        match self.peek() {
            Some('-') => {
                self.bump();
                Ok(-self.parse_factor()?)
            }
            Some('+') => {
                self.bump();
                self.parse_factor()
            }
            Some('(') => {
                self.bump();
                let value = self.parse_expr()?;
                self.skip_ws();
                match self.bump() {
                    Some(')') => Ok(value),
                    _ => Err("unbalanced parentheses".to_string()),
                }
            }
            Some('$') => {
                self.bump();
                self.parse_variable()
            }
            Some(c) if c.is_ascii_digit() || c == '.' => self.parse_number(),
            _ => Err("expected a value in expression".to_string()),
        }
    }

    fn parse_variable(&mut self) -> Result<f64, String> {
        let mut digits = String::new();
        while let Some(c) = self.peek() {
            if c.is_ascii_digit() {
                digits.push(c);
                self.bump();
            } else {
                break;
            }
        }
        if digits.is_empty() {
            return Err("expected a variable number after '$'".to_string());
        }
        let index: usize = digits
            .parse()
            .map_err(|_| "invalid variable index".to_string())?;
        if index == 0 {
            return Err("macro variable $0 is not allowed".to_string());
        }
        self.params
            .get(index - 1)
            .copied()
            .ok_or_else(|| format!("macro variable ${index} is out of range"))
    }

    fn parse_number(&mut self) -> Result<f64, String> {
        let mut s = String::new();
        while let Some(c) = self.peek() {
            if c.is_ascii_digit() || c == '.' {
                s.push(c);
                self.bump();
            } else {
                break;
            }
        }
        s.parse::<f64>()
            .map_err(|_| format!("invalid number {s:?}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arithmetic_and_precedence() {
        let v = eval("$1 X 2 + 3", &[2.0]).unwrap();
        assert_eq!(v, 7.0);
        let v = eval("(1 + 2) x 4", &[]).unwrap();
        assert_eq!(v, 12.0);
        let v = eval("1 + 2 / 2", &[]).unwrap();
        assert_eq!(v, 2.0);
    }

    #[test]
    fn variables_and_unary() {
        let v = eval("$1 + -$2", &[1.5, 0.5]).unwrap();
        assert_eq!(v, 1.0);
    }

    #[test]
    fn out_of_range_variable_errors() {
        assert!(eval("$2", &[1.0]).is_err());
    }
}
