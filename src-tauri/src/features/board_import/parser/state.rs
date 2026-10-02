use std::collections::HashMap;

use crate::contracts::{
    Aperture, ArcDirection, Contour, GraphicObject, GraphicsIr, OriginalUnit, Point, Polarity,
    Segment, SourceInfo, StepRepeat, Unit, ZeroSuppression, GRAPHICS_IR_VERSION,
};

use super::aperture::{parse_aperture_definition, parse_macro, MacroTemplate};
use super::error::ParseError;
use super::format::{parse_coord, parse_format_spec, Axis, CoordinateFormat};
use super::lexer::{Lexer, Record, RecordKind};

const INCH_TO_MM: f64 = 25.4;
const POSITION_EPSILON: f64 = 1e-6;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Interpolation {
    Linear,
    Clockwise,
    CounterClockwise,
}

/// Incremental parser state. Consumes lexer records and emits the IR.
pub struct State {
    // format and units
    zero: ZeroSuppression,
    fmt: Option<CoordinateFormat>,
    original_unit: OriginalUnit,
    scale: f64,
    coord_format_str: Option<String>,

    // image offset from `%OF%`
    offset_x: f64,
    offset_y: f64,

    // apertures and macros
    apertures: Vec<Aperture>,
    aperture_index: HashMap<u32, usize>,
    macros: HashMap<String, MacroTemplate>,

    // drawing state
    pos: Point,
    i: f64,
    j: f64,
    aperture: Option<u32>,
    interpolation: Interpolation,
    polarity: Polarity,
    operation: u32,
    repeat_closed: bool,
    region_mode: bool,
    region_offset: usize,
    region_contours: Vec<Contour>,

    // pending stroke
    stroke_aperture: Option<u32>,
    stroke_start: Point,
    stroke_offset: usize,
    stroke_segments: Vec<Segment>,

    // output
    objects: Vec<GraphicObject>,
    step_and_repeat: Option<StepRepeat>,
    eof: bool,
}

impl State {
    pub fn parse(source: &str) -> Result<GraphicsIr, ParseError> {
        let mut state = State::new();
        let mut lexer = Lexer::new(source);
        while let Some(record) = lexer.next_record()? {
            state.handle(record)?;
            if state.eof {
                break;
            }
        }
        state.finish()
    }

    fn new() -> Self {
        Self {
            zero: ZeroSuppression::Leading,
            fmt: None,
            original_unit: OriginalUnit::In,
            scale: INCH_TO_MM,
            coord_format_str: None,
            offset_x: 0.0,
            offset_y: 0.0,
            apertures: Vec::new(),
            aperture_index: HashMap::new(),
            macros: HashMap::new(),
            pos: Point::new(0.0, 0.0),
            i: 0.0,
            j: 0.0,
            aperture: None,
            interpolation: Interpolation::Linear,
            polarity: Polarity::Dark,
            operation: 2,
            repeat_closed: false,
            region_mode: false,
            region_offset: 0,
            region_contours: Vec::new(),
            stroke_aperture: None,
            stroke_start: Point::new(0.0, 0.0),
            stroke_offset: 0,
            stroke_segments: Vec::new(),
            objects: Vec::new(),
            step_and_repeat: None,
            eof: false,
        }
    }

    fn handle(&mut self, record: Record) -> Result<(), ParseError> {
        match record.kind {
            RecordKind::Extended(head) => self.handle_extended(record.offset, &head),
            RecordKind::Macro { name, primitives } => {
                let template = parse_macro(record.offset, &primitives)?;
                self.macros.insert(name, template);
                Ok(())
            }
            RecordKind::Data(content) => self.handle_data(record.offset, &content),
        }
    }

    fn handle_extended(&mut self, offset: usize, head: &str) -> Result<(), ParseError> {
        let upper = head.to_ascii_uppercase();
        let cmd: String = upper.chars().take(2).collect();
        match cmd.as_str() {
            "FS" => {
                let (zero, fmt) =
                    parse_format_spec(head).map_err(|e| ParseError::new(offset, e))?;
                self.zero = zero;
                self.fmt = Some(fmt);
                self.coord_format_str = Some(head.trim().to_string());
            }
            "MO" => match &upper[2..] {
                "MM" => {
                    self.original_unit = OriginalUnit::Mm;
                    self.scale = 1.0;
                }
                "IN" => {
                    self.original_unit = OriginalUnit::In;
                    self.scale = INCH_TO_MM;
                }
                other => return Err(ParseError::new(offset, format!("unknown unit {other:?}"))),
            },
            "AD" => {
                let aperture = parse_aperture_definition(offset, head, &self.macros, self.scale)?;
                self.set_aperture(aperture);
            }
            "LP" => {
                self.flush_stroke();
                if upper == "LPD" {
                    self.polarity = Polarity::Dark;
                } else if upper == "LPC" {
                    self.polarity = Polarity::Clear;
                } else {
                    return Err(ParseError::new(
                        offset,
                        format!("unknown polarity command {head:?}"),
                    ));
                }
            }
            "SR" => {
                self.flush_stroke();
                if upper == "SR" {
                    self.repeat_closed = self.step_and_repeat.is_some();
                } else {
                    if self.step_and_repeat.is_some()
                        || !self.objects.is_empty()
                        || self.region_mode
                    {
                        return Err(ParseError::new(
                            offset,
                            "only whole-layer step and repeat is supported",
                        ));
                    }
                    self.step_and_repeat = Some(parse_step_repeat(offset, head, self.scale)?);
                }
            }
            "IP" => {
                if upper == "IPNEG" {
                    return Err(ParseError::new(
                        offset,
                        "negative image polarity (%IPNEG%) is not supported",
                    ));
                }
                // `%IPPOS%` and other image-polarity variants are a no-op.
            }
            "OF" => {
                let (a, b) = parse_keyed_pair(offset, head)?;
                self.offset_x = a * self.scale;
                self.offset_y = b * self.scale;
            }
            // File and aperture attributes carry metadata only.
            "TF" | "TA" | "TD" | "TO" => {}
            other => {
                return Err(ParseError::new(
                    offset,
                    format!("unsupported extended command {other:?}"),
                ))
            }
        }
        Ok(())
    }

    fn handle_data(&mut self, offset: usize, content: &str) -> Result<(), ParseError> {
        let trimmed = content.trim();
        if trimmed.is_empty() {
            return Ok(());
        }
        let upper = trimmed.to_ascii_uppercase();
        if upper.starts_with("G04") || upper.starts_with("G4") {
            return Ok(()); // comment
        }
        if upper.starts_with("M02") || upper == "M00" || upper == "M01" {
            self.eof = true;
            return Ok(());
        }

        let words = scan_words(content);
        let mut x = self.pos.x;
        let mut y = self.pos.y;
        let mut i = 0.0;
        let mut j = 0.0;
        let mut g: Option<u32> = None;
        let mut d: Option<u32> = None;

        for (letter, num) in &words {
            match letter.to_ascii_uppercase() {
                'X' => x = self.parse_xy(offset, num, Axis::X)?,
                'Y' => y = self.parse_xy(offset, num, Axis::Y)?,
                'I' => i = self.parse_ij(offset, num, Axis::X)?,
                'J' => j = self.parse_ij(offset, num, Axis::Y)?,
                'G' => g = Some(parse_code(num, offset)?),
                'D' => d = Some(parse_code(num, offset)?),
                'M' => {}
                other => return Err(ParseError::new(offset, format!("unknown word {other:?}"))),
            }
        }

        if let Some(code) = g {
            self.apply_g(code, offset)?;
        }

        self.i = i;
        self.j = j;
        if let Some(code) = d {
            self.apply_d(code, offset, x, y)?;
        } else if words
            .iter()
            .any(|(letter, _)| matches!(letter.to_ascii_uppercase(), 'X' | 'Y' | 'I' | 'J'))
        {
            self.apply_d(self.operation, offset, x, y)?;
        }
        Ok(())
    }

    fn parse_xy(&self, offset: usize, raw: &str, axis: Axis) -> Result<f64, ParseError> {
        let fmt = self.fmt.as_ref().ok_or_else(|| {
            ParseError::new(offset, "coordinate before %FS% format specification")
        })?;
        let value =
            parse_coord(raw, fmt, axis, self.zero).map_err(|e| ParseError::new(offset, e))?;
        let offset = match axis {
            Axis::X => self.offset_x,
            Axis::Y => self.offset_y,
        };
        Ok(value * self.scale + offset)
    }

    fn parse_ij(&self, offset: usize, raw: &str, axis: Axis) -> Result<f64, ParseError> {
        let fmt = self.fmt.as_ref().ok_or_else(|| {
            ParseError::new(offset, "coordinate before %FS% format specification")
        })?;
        let value =
            parse_coord(raw, fmt, axis, self.zero).map_err(|e| ParseError::new(offset, e))?;
        // I/J are relative to the arc start point, so the image offset does not apply.
        Ok(value * self.scale)
    }

    fn apply_g(&mut self, code: u32, offset: usize) -> Result<(), ParseError> {
        match code {
            1 => self.interpolation = Interpolation::Linear,
            2 => self.interpolation = Interpolation::Clockwise,
            3 => self.interpolation = Interpolation::CounterClockwise,
            4 => {} // comment, already skipped as a block
            36 => {
                if self.region_mode {
                    return Err(ParseError::new(offset, "nested region start (G36)"));
                }
                self.flush_stroke();
                self.region_mode = true;
                self.region_offset = offset;
                self.region_contours = vec![Contour {
                    start: self.pos,
                    segments: Vec::new(),
                }];
            }
            37 => {
                if !self.region_mode {
                    return Err(ParseError::new(offset, "region end (G37) without start"));
                }
                self.emit_region();
                self.region_mode = false;
            }
            54 => {} // legacy aperture selection prefix, not a flash
            74 => {
                return Err(ParseError::new(
                    offset,
                    "single-quadrant arcs are not supported; export multi-quadrant Gerber",
                ))
            }
            75 => {} // multi-quadrant mode
            90 => {} // absolute coordinates (the default)
            other => {
                return Err(ParseError::new(
                    offset,
                    format!("unsupported G-code G{other:02}"),
                ))
            }
        }
        Ok(())
    }

    fn apply_d(&mut self, code: u32, offset: usize, x: f64, y: f64) -> Result<(), ParseError> {
        if self.repeat_closed && matches!(code, 1 | 3) {
            return Err(ParseError::new(
                offset,
                "drawing after a closed repeat block is not supported",
            ));
        }
        if matches!(code, 1..=3) {
            self.operation = code;
        }
        match code {
            1 => {
                // draw
                let segment = self.make_segment(x, y);
                if self.region_mode {
                    self.region_contours
                        .last_mut()
                        .expect("region has a contour")
                        .segments
                        .push(segment);
                } else {
                    let aperture = self.aperture.ok_or_else(|| {
                        ParseError::new(offset, "draw (D01) without a selected aperture")
                    })?;
                    if self.stroke_segments.is_empty() {
                        self.stroke_aperture = Some(aperture);
                        self.stroke_start = self.pos;
                        self.stroke_offset = offset;
                    }
                    self.stroke_segments.push(segment);
                }
                self.pos = Point::new(x, y);
            }
            2 => {
                // move
                if self.region_mode {
                    if self
                        .region_contours
                        .last()
                        .map(|c| !c.segments.is_empty())
                        .unwrap_or(false)
                    {
                        self.region_contours.push(Contour {
                            start: Point::new(x, y),
                            segments: Vec::new(),
                        });
                    } else if let Some(contour) = self.region_contours.last_mut() {
                        contour.start = Point::new(x, y);
                    }
                } else {
                    self.flush_stroke();
                }
                self.pos = Point::new(x, y);
            }
            3 => {
                // flash
                let aperture = self.aperture.ok_or_else(|| {
                    ParseError::new(offset, "flash (D03) without a selected aperture")
                })?;
                self.flush_stroke();
                self.objects.push(GraphicObject::Flash {
                    polarity: self.polarity,
                    aperture,
                    at: Point::new(x, y),
                    source_offset: offset,
                });
                self.pos = Point::new(x, y);
            }
            10..=999 => {
                // aperture select
                self.flush_stroke();
                if !self.aperture_index.contains_key(&code) {
                    return Err(ParseError::new(
                        offset,
                        format!("aperture D{code} was not defined"),
                    ));
                }
                self.aperture = Some(code);
                self.pos = Point::new(x, y);
            }
            other => {
                return Err(ParseError::new(
                    offset,
                    format!("unsupported D-code D{other}"),
                ))
            }
        }
        Ok(())
    }

    fn make_segment(&self, x: f64, y: f64) -> Segment {
        match self.interpolation {
            Interpolation::Linear => Segment::Line {
                to: Point::new(x, y),
            },
            Interpolation::Clockwise | Interpolation::CounterClockwise => {
                let direction = if self.interpolation == Interpolation::Clockwise {
                    ArcDirection::Clockwise
                } else {
                    ArcDirection::CounterClockwise
                };
                let center = Point::new(self.pos.x + self.i, self.pos.y + self.j);
                let full_circle = (x - self.pos.x).abs() < POSITION_EPSILON
                    && (y - self.pos.y).abs() < POSITION_EPSILON;
                Segment::Arc {
                    to: Point::new(x, y),
                    center,
                    direction,
                    full_circle,
                }
            }
        }
    }

    fn flush_stroke(&mut self) {
        if self.stroke_segments.is_empty() {
            return;
        }
        let segments = std::mem::take(&mut self.stroke_segments);
        let aperture = self
            .stroke_aperture
            .expect("a non-empty stroke always has an aperture");
        self.objects.push(GraphicObject::Stroke {
            polarity: self.polarity,
            aperture,
            start: self.stroke_start,
            segments,
            source_offset: self.stroke_offset,
        });
        self.stroke_aperture = None;
    }

    fn emit_region(&mut self) {
        let contours = std::mem::take(&mut self.region_contours);
        let contours: Vec<Contour> = contours
            .into_iter()
            .filter(|c| !c.segments.is_empty())
            .collect();
        if !contours.is_empty() {
            self.objects.push(GraphicObject::Region {
                polarity: self.polarity,
                contours,
                source_offset: self.region_offset,
            });
        }
    }

    fn set_aperture(&mut self, aperture: Aperture) {
        let code = aperture.code;
        if let Some(&index) = self.aperture_index.get(&code) {
            self.apertures[index] = aperture;
        } else {
            self.aperture_index.insert(code, self.apertures.len());
            self.apertures.push(aperture);
        }
    }

    fn finish(mut self) -> Result<GraphicsIr, ParseError> {
        if self.region_mode {
            return Err(ParseError::new(0, "unterminated region at end of file"));
        }
        self.flush_stroke();
        Ok(GraphicsIr {
            schema_version: GRAPHICS_IR_VERSION.to_string(),
            unit: Unit::Mm,
            apertures: self.apertures,
            objects: self.objects,
            step_and_repeat: self.step_and_repeat,
            source: SourceInfo {
                original_unit: self.original_unit,
                coordinate_format: self.coord_format_str,
                zero_suppression: self.zero,
            },
        })
    }
}

fn parse_code(num: &str, offset: usize) -> Result<u32, ParseError> {
    num.parse::<u32>()
        .map_err(|_| ParseError::new(offset, format!("invalid code {num:?}")))
}

/// Scans a record for `letter + number` words. The number may carry a leading
/// sign and a decimal point; other characters are skipped.
fn scan_words(content: &str) -> Vec<(char, String)> {
    let chars: Vec<char> = content.chars().collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_ascii_alphabetic() {
            let letter = c;
            i += 1;
            let mut num = String::new();
            if i < chars.len() && (chars[i] == '+' || chars[i] == '-') {
                num.push(chars[i]);
                i += 1;
            }
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                num.push(chars[i]);
                i += 1;
            }
            out.push((letter, num));
        } else {
            i += 1;
        }
    }
    out
}

/// Parses the `A`/`B` values out of an `%OF%` or similar keyed parameter body.
fn parse_keyed_pair(offset: usize, head: &str) -> Result<(f64, f64), ParseError> {
    let mut a = 0.0;
    let mut b = 0.0;
    for (letter, num) in scan_words(head) {
        match letter.to_ascii_uppercase() {
            'A' => {
                a = num
                    .parse::<f64>()
                    .map_err(|_| ParseError::new(offset, format!("invalid offset value {num:?}")))?
            }
            'B' => {
                b = num
                    .parse::<f64>()
                    .map_err(|_| ParseError::new(offset, format!("invalid offset value {num:?}")))?
            }
            _ => {}
        }
    }
    Ok((a, b))
}

/// Parses `%SRX<count>Y<count>I<stepX>J<stepY>%`, scaling steps to millimetres.
fn parse_step_repeat(offset: usize, head: &str, scale: f64) -> Result<StepRepeat, ParseError> {
    let mut x: Option<u32> = None;
    let mut y: Option<u32> = None;
    let mut i: Option<f64> = None;
    let mut j: Option<f64> = None;
    for (letter, num) in scan_words(head) {
        match letter.to_ascii_uppercase() {
            'X' => x = Some(parse_count(offset, &num)?),
            'Y' => y = Some(parse_count(offset, &num)?),
            'I' => i = Some(parse_step(offset, &num)?),
            'J' => j = Some(parse_step(offset, &num)?),
            _ => {}
        }
    }
    let x_count = x.ok_or_else(|| ParseError::new(offset, "%SR% is missing X repeat count"))?;
    let y_count = y.ok_or_else(|| ParseError::new(offset, "%SR% is missing Y repeat count"))?;
    if x_count < 1 || y_count < 1 {
        return Err(ParseError::new(
            offset,
            "%SR% repeat counts must be at least 1",
        ));
    }
    Ok(StepRepeat {
        x_count,
        y_count,
        x_step: i.unwrap_or(0.0) * scale,
        y_step: j.unwrap_or(0.0) * scale,
    })
}

fn parse_count(offset: usize, num: &str) -> Result<u32, ParseError> {
    num.parse::<u32>()
        .map_err(|_| ParseError::new(offset, format!("invalid repeat count {num:?}")))
}

fn parse_step(offset: usize, num: &str) -> Result<f64, ParseError> {
    num.parse::<f64>()
        .map_err(|_| ParseError::new(offset, format!("invalid step value {num:?}")))
}
