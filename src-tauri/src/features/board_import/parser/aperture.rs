use std::collections::HashMap;

use crate::contracts::{Aperture, ApertureShape, Exposure, MacroPrimitive, MacroShape, Point};

use super::error::ParseError;
use super::expression;

/// An `%AM%` aperture-macro template: primitives whose parameters are still
/// expressions over `$1`..`$n`.
#[derive(Debug, Clone)]
pub struct MacroTemplate {
    primitives: Vec<RawPrimitive>,
}

#[derive(Debug, Clone)]
struct RawPrimitive {
    code: u32,
    args: Vec<String>,
}

/// Parses an `%AM%` body (a list of comma-separated primitives) into a template.
pub fn parse_macro(offset: usize, primitives: &[String]) -> Result<MacroTemplate, ParseError> {
    let mut out = Vec::with_capacity(primitives.len());
    for prim in primitives {
        let parts: Vec<&str> = prim.split(',').map(str::trim).collect();
        let code: u32 = parts[0].parse().map_err(|_| {
            ParseError::new(
                offset,
                format!("invalid macro primitive code {:?}", parts[0]),
            )
        })?;
        out.push(RawPrimitive {
            code,
            args: parts[1..].iter().map(|s| s.to_string()).collect(),
        });
    }
    Ok(MacroTemplate { primitives: out })
}

/// Parses an `%ADD%` command content (e.g. `ADD10C,0.5`) into an aperture.
/// Lengths are scaled into millimetres by `scale` (the current unit factor).
pub fn parse_aperture_definition(
    offset: usize,
    head: &str,
    macros: &HashMap<String, MacroTemplate>,
    scale: f64,
) -> Result<Aperture, ParseError> {
    let s = head.trim();
    if s.len() < 5 || !s[..2].eq_ignore_ascii_case("AD") {
        return Err(ParseError::new(
            offset,
            format!("invalid aperture definition {head:?}"),
        ));
    }
    let rest = &s[2..];
    if !rest.starts_with('D') && !rest.starts_with('d') {
        return Err(ParseError::new(
            offset,
            format!("invalid aperture definition {head:?}"),
        ));
    }
    let rest = &rest[1..];
    let code_end = rest
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(rest.len());
    if code_end == 0 {
        return Err(ParseError::new(offset, "aperture definition has no D-code"));
    }
    let code: u32 = rest[..code_end]
        .parse()
        .map_err(|_| ParseError::new(offset, "invalid aperture D-code"))?;
    if code < 10 {
        return Err(ParseError::new(
            offset,
            "aperture D-code must be 10 or greater",
        ));
    }
    let rest = &rest[code_end..];
    let comma = rest
        .find(',')
        .ok_or_else(|| ParseError::new(offset, "aperture definition is missing ','"))?;
    let template = rest[..comma].trim();
    let params = parse_params(offset, &rest[comma + 1..])?;

    let shape = match template {
        "C" | "c" => {
            require_len(offset, &params, 1, 2, "circle aperture")?;
            ApertureShape::Circle {
                diameter: params[0] * scale,
                hole_diameter: params.get(1).map(|h| h * scale),
            }
        }
        "R" | "r" | "O" | "o" => {
            require_len(offset, &params, 2, 3, "rectangle/obround aperture")?;
            let (width, height) = (params[0] * scale, params[1] * scale);
            let hole = params.get(2).map(|h| h * scale);
            if template.eq_ignore_ascii_case("O") {
                ApertureShape::Obround {
                    width,
                    height,
                    hole_diameter: hole,
                }
            } else {
                ApertureShape::Rectangle {
                    width,
                    height,
                    hole_diameter: hole,
                }
            }
        }
        "P" | "p" => {
            require_len(offset, &params, 2, 3, "polygon aperture")?;
            let vertices = params[1].round() as u32;
            if vertices < 3 {
                return Err(ParseError::new(
                    offset,
                    "polygon aperture needs at least 3 vertices",
                ));
            }
            ApertureShape::Polygon {
                diameter: params[0] * scale,
                vertices,
                rotation_deg: params.get(2).copied().unwrap_or(0.0),
            }
        }
        name => {
            let macro_template = macros.get(name).ok_or_else(|| {
                ParseError::new(offset, format!("unknown aperture macro {name:?}"))
            })?;
            let primitives = instantiate_macro(offset, macro_template, &params, scale)?;
            ApertureShape::Macro {
                name: name.to_string(),
                primitives,
            }
        }
    };
    Ok(Aperture { code, shape })
}

fn parse_params(offset: usize, s: &str) -> Result<Vec<f64>, ParseError> {
    let mut out = Vec::new();
    for part in s.split(['X', 'x']) {
        let part = part.trim();
        if part.is_empty() {
            return Err(ParseError::new(offset, "empty aperture parameter"));
        }
        let value: f64 = part
            .parse()
            .map_err(|_| ParseError::new(offset, format!("invalid aperture parameter {part:?}")))?;
        out.push(value);
    }
    Ok(out)
}

fn require_len<T>(
    offset: usize,
    items: &[T],
    min: usize,
    max: usize,
    what: &str,
) -> Result<(), ParseError> {
    if items.len() < min || items.len() > max {
        return Err(ParseError::new(
            offset,
            format!(
                "{what} expects {min}..={max} parameters, got {}",
                items.len()
            ),
        ));
    }
    Ok(())
}

fn eval(args: &[String], i: usize, params: &[f64], offset: usize) -> Result<f64, ParseError> {
    expression::eval(&args[i], params).map_err(|e| ParseError::new(offset, e))
}

fn exposure(args: &[String], params: &[f64], offset: usize) -> Result<Exposure, ParseError> {
    let v = eval(args, 0, params, offset)?;
    if v == 0.0 {
        Ok(Exposure::Off)
    } else if v == 1.0 {
        Ok(Exposure::On)
    } else {
        Err(ParseError::new(
            offset,
            format!("macro exposure must be 0 or 1, got {v}"),
        ))
    }
}

fn optional_rotation(
    args: &[String],
    at: usize,
    params: &[f64],
    offset: usize,
) -> Result<Option<f64>, ParseError> {
    Ok(if at < args.len() {
        Some(eval(args, at, params, offset)?)
    } else {
        None
    })
}

/// Evaluates a macro template with concrete `%ADD%` parameters into primitives.
fn instantiate_macro(
    offset: usize,
    template: &MacroTemplate,
    params: &[f64],
    scale: f64,
) -> Result<Vec<MacroPrimitive>, ParseError> {
    let mut out = Vec::new();
    for raw in &template.primitives {
        if let Some(prim) = evaluate_primitive(offset, raw, params, scale)? {
            out.push(prim);
        }
    }
    Ok(out)
}

fn evaluate_primitive(
    offset: usize,
    raw: &RawPrimitive,
    params: &[f64],
    scale: f64,
) -> Result<Option<MacroPrimitive>, ParseError> {
    let a = &raw.args;
    let shape = match raw.code {
        0 => return Ok(None), // comment primitive
        1 => {
            // circle: exposure, diameter, cx, cy [, rotation]
            require_len(offset, a, 4, 5, "circle primitive")?;
            MacroShape::Circle {
                diameter: eval(a, 1, params, offset)? * scale,
                center: Point::new(
                    eval(a, 2, params, offset)? * scale,
                    eval(a, 3, params, offset)? * scale,
                ),
                rotation_deg: optional_rotation(a, 4, params, offset)?,
            }
        }
        2 | 20 => {
            // vector line: exposure, width, x1, y1, x2, y2 [, rotation]
            require_len(offset, a, 7, 8, "vector-line primitive")?;
            MacroShape::VectorLine {
                width: eval(a, 1, params, offset)? * scale,
                start: Point::new(
                    eval(a, 2, params, offset)? * scale,
                    eval(a, 3, params, offset)? * scale,
                ),
                end: Point::new(
                    eval(a, 4, params, offset)? * scale,
                    eval(a, 5, params, offset)? * scale,
                ),
                rotation_deg: optional_rotation(a, 6, params, offset)?,
            }
        }
        21 => {
            // centre line (rectangle from centre): exposure, width, height, cx, cy [, rotation]
            require_len(offset, a, 6, 7, "centre-line primitive")?;
            MacroShape::CenterLine {
                width: eval(a, 1, params, offset)? * scale,
                height: eval(a, 2, params, offset)? * scale,
                center: Point::new(
                    eval(a, 3, params, offset)? * scale,
                    eval(a, 4, params, offset)? * scale,
                ),
                rotation_deg: optional_rotation(a, 5, params, offset)?,
            }
        }
        22 => {
            // lower-left line: exposure, width, height, x, y [, rotation]
            require_len(offset, a, 6, 7, "lower-left-line primitive")?;
            MacroShape::LowerLeftLine {
                width: eval(a, 1, params, offset)? * scale,
                height: eval(a, 2, params, offset)? * scale,
                lower_left: Point::new(
                    eval(a, 3, params, offset)? * scale,
                    eval(a, 4, params, offset)? * scale,
                ),
                rotation_deg: optional_rotation(a, 5, params, offset)?,
            }
        }
        4 => {
            // outline: exposure, n, X0,Y0, ..., Xn,Yn [, rotation]
            if a.len() < 4 {
                return Err(ParseError::new(
                    offset,
                    "outline primitive has too few parameters",
                ));
            }
            let rest = &a[2..];
            // Coordinate pairs come in twos; a lone trailing value is rotation.
            let (coords, rotation) = if rest.len() % 2 == 1 {
                let (last, head) = rest.split_last().unwrap();
                (
                    head,
                    Some(expression::eval(last, params).map_err(|e| ParseError::new(offset, e))?),
                )
            } else {
                (rest, None)
            };
            let mut vertices = Vec::with_capacity(coords.len() / 2);
            for pair in coords.chunks(2) {
                vertices.push(Point::new(
                    eval(pair, 0, params, offset)? * scale,
                    eval(pair, 1, params, offset)? * scale,
                ));
            }
            MacroShape::Outline {
                vertices,
                rotation_deg: rotation,
            }
        }
        5 => {
            // regular polygon: exposure, vertices, cx, cy, diameter [, rotation]
            require_len(offset, a, 5, 6, "polygon primitive")?;
            let vertices = eval(a, 1, params, offset)?.round() as u32;
            if vertices < 3 {
                return Err(ParseError::new(
                    offset,
                    "polygon primitive needs at least 3 vertices",
                ));
            }
            MacroShape::Polygon {
                vertices,
                center: Point::new(
                    eval(a, 2, params, offset)? * scale,
                    eval(a, 3, params, offset)? * scale,
                ),
                diameter: eval(a, 4, params, offset)? * scale,
                rotation_deg: optional_rotation(a, 5, params, offset)?,
            }
        }
        6 => {
            return Err(ParseError::new(
                offset,
                "moiré aperture primitive (code 6) is not supported",
            ))
        }
        7 => {
            // thermal: cx, cy, outer, inner, gap [, rotation] — no exposure field.
            require_len(offset, a, 5, 6, "thermal primitive")?;
            MacroShape::Thermal {
                center: Point::new(
                    eval(a, 0, params, offset)? * scale,
                    eval(a, 1, params, offset)? * scale,
                ),
                outer_diameter: eval(a, 2, params, offset)? * scale,
                inner_diameter: eval(a, 3, params, offset)? * scale,
                gap: eval(a, 4, params, offset)? * scale,
                rotation_deg: optional_rotation(a, 5, params, offset)?,
            }
        }
        code => {
            return Err(ParseError::new(
                offset,
                format!("unknown aperture-macro primitive code {code}"),
            ))
        }
    };

    // Thermal has no exposure field; everything else reads it from arg 0.
    let exposure = if raw.code == 7 {
        Exposure::On
    } else {
        exposure(a, params, offset)?
    };
    Ok(Some(MacroPrimitive { exposure, shape }))
}
