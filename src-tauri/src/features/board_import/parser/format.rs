use crate::contracts::ZeroSuppression;

/// Which axis a coordinate belongs to, used to pick the matching integer and
/// decimal digit counts from the `%FS%` format. Arc centre offsets `I` use the
/// X format and `J` the Y format.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Axis {
    X,
    Y,
}

/// Coordinate format declared by `%FS%`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CoordinateFormat {
    pub x_integer: u8,
    pub x_decimal: u8,
    pub y_integer: u8,
    pub y_decimal: u8,
}

/// Parses the content of a `%FS%` command, e.g. `FSLAX34Y34`, into a
/// zero-suppression mode and per-axis digit counts. Absolute coordinates are
/// required; incremental mode is not supported.
pub fn parse_format_spec(head: &str) -> Result<(ZeroSuppression, CoordinateFormat), String> {
    let s = head.trim();
    if s.len() < 6 || !s[..2].eq_ignore_ascii_case("FS") {
        return Err(format!("invalid format specification {head:?}"));
    }
    let bytes = s.as_bytes();
    let zero = match bytes[2] {
        b'L' | b'l' => ZeroSuppression::Leading,
        b'T' | b't' => ZeroSuppression::Trailing,
        b'D' | b'd' => ZeroSuppression::Explicit,
        c => return Err(format!("unknown zero-suppression mode {:?}", c as char)),
    };
    match bytes[3] {
        b'A' | b'a' => {}
        b'I' | b'i' => return Err("incremental coordinates are not supported".to_string()),
        c => return Err(format!("unknown coordinate mode {:?}", c as char)),
    }

    let mut fmt = CoordinateFormat {
        x_integer: 0,
        x_decimal: 0,
        y_integer: 0,
        y_decimal: 0,
    };
    let mut seen_x = false;
    let mut seen_y = false;
    let mut i = 4;
    while i < bytes.len() {
        match bytes[i] {
            b'X' | b'x' => {
                let (a, b) = read_two_digits(bytes, i + 1, s)?;
                fmt.x_integer = a;
                fmt.x_decimal = b;
                seen_x = true;
                i += 3;
            }
            b'Y' | b'y' => {
                let (a, b) = read_two_digits(bytes, i + 1, s)?;
                fmt.y_integer = a;
                fmt.y_decimal = b;
                seen_y = true;
                i += 3;
            }
            c => {
                return Err(format!(
                    "unexpected character {:?} in format specification",
                    c as char
                ))
            }
        }
    }
    if !seen_x || !seen_y {
        return Err("format specification is missing X or Y digits".to_string());
    }
    Ok((zero, fmt))
}

fn read_two_digits(bytes: &[u8], at: usize, full: &str) -> Result<(u8, u8), String> {
    let d = |i: usize| -> Result<u8, String> {
        let c = *bytes
            .get(i)
            .ok_or_else(|| format!("truncated format specification {full:?}"))?;
        if c.is_ascii_digit() {
            Ok(c - b'0')
        } else {
            Err(format!("expected a digit in format specification {full:?}"))
        }
    };
    Ok((d(at)?, d(at + 1)?))
}

/// Parses a single coordinate value in file units, applying the `%FS%`
/// zero-suppression and digit counts when no decimal point is present.
pub fn parse_coord(
    raw: &str,
    fmt: &CoordinateFormat,
    axis: Axis,
    zero: ZeroSuppression,
) -> Result<f64, String> {
    let raw = raw.trim();
    if raw.contains('.') {
        return raw
            .parse::<f64>()
            .map_err(|_| format!("invalid coordinate {raw:?}"));
    }
    let (integer, decimal) = match axis {
        Axis::X => (fmt.x_integer, fmt.x_decimal),
        Axis::Y => (fmt.y_integer, fmt.y_decimal),
    };
    if zero == ZeroSuppression::Explicit {
        // Explicit-decimal mode should carry a `.`; a bare integer is tolerated
        // as an integer value.
        return raw
            .parse::<f64>()
            .map_err(|_| format!("invalid coordinate {raw:?}"));
    }
    let (negative, body) = match raw.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, raw.strip_prefix('+').unwrap_or(raw)),
    };
    if body.is_empty() || !body.chars().all(|c| c.is_ascii_digit()) {
        return Err(format!("invalid coordinate {raw:?}"));
    }
    let width = (integer + decimal) as usize;
    let full = match zero {
        ZeroSuppression::Leading => format!("{body:0>width$}"),
        ZeroSuppression::Trailing => format!("{body:0<width$}"),
        ZeroSuppression::Explicit => unreachable!(),
    };
    if full.len() > width {
        return Err(format!(
            "coordinate {raw:?} is wider than the declared {width}-digit format"
        ));
    }
    let (int_part, dec_part) = full.split_at(integer as usize);
    let int_val: f64 = int_part.parse().unwrap_or(0.0);
    let dec_val: f64 = if dec_part.is_empty() {
        0.0
    } else {
        format!("0.{dec_part}").parse().unwrap_or(0.0)
    };
    let value = int_val + dec_val;
    Ok(if negative { -value } else { value })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fmt34() -> CoordinateFormat {
        CoordinateFormat {
            x_integer: 3,
            x_decimal: 4,
            y_integer: 3,
            y_decimal: 4,
        }
    }

    #[test]
    fn parses_format_spec() {
        let (zero, fmt) = parse_format_spec("FSLAX34Y34").unwrap();
        assert_eq!(zero, ZeroSuppression::Leading);
        assert_eq!(fmt.x_integer, 3);
        assert_eq!(fmt.x_decimal, 4);
        assert_eq!(fmt.y_integer, 3);
        assert_eq!(fmt.y_decimal, 4);
    }

    #[test]
    fn leading_zero_suppression() {
        // "1234" -> 00.1234
        let v = parse_coord("1234", &fmt34(), Axis::X, ZeroSuppression::Leading).unwrap();
        assert!((v - 0.1234).abs() < 1e-9);
    }

    #[test]
    fn trailing_zero_suppression() {
        // Trailing zeros are omitted: 12.34 -> "0123400" -> "01234".
        let v = parse_coord("01234", &fmt34(), Axis::X, ZeroSuppression::Trailing).unwrap();
        assert!((v - 12.34).abs() < 1e-9);
    }

    #[test]
    fn negative_and_explicit_decimal() {
        let v = parse_coord("-1234", &fmt34(), Axis::X, ZeroSuppression::Leading).unwrap();
        assert!((v + 0.1234).abs() < 1e-9);
        let v = parse_coord("1.5", &fmt34(), Axis::Y, ZeroSuppression::Leading).unwrap();
        assert_eq!(v, 1.5);
    }
}
