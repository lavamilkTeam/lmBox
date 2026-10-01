//! Graphics IR — Rust binding of `contracts/schemas/v1/graphics.schema.json`.
//!
//! All lengths are normalized to millimetres. Arcs keep their centre and
//! direction; aperture macros are stored as already-evaluated primitives, and
//! drawing order plus dark/clear polarity are preserved. Contouring, offset,
//! and meshing are intentionally left to the Python engine.

use serde::{Deserialize, Serialize};

/// Version of the graphics IR schema this binding targets.
pub const GRAPHICS_IR_VERSION: &str = "1";

/// A parsed Gerber layer, normalized to millimetres.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GraphicsIr {
    pub schema_version: String,
    pub unit: Unit,
    /// Aperture definitions keyed by D-code (stored as an ordered list).
    pub apertures: Vec<Aperture>,
    /// Ordered drawing operations (flash, stroke, region).
    pub objects: Vec<GraphicObject>,
    /// Whole-image step-and-repeat, when the source declares `%SR%`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step_and_repeat: Option<StepRepeat>,
    pub source: SourceInfo,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Unit {
    /// Millimetres — the only unit present in the IR after normalization.
    Mm,
}

/// Source-level metadata retained for traceability.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    /// Original unit declared by the file, before normalization.
    pub original_unit: OriginalUnit,
    /// Raw `%FS%` coordinate format, e.g. `X34Y34`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub coordinate_format: Option<String>,
    /// Zero-suppression mode declared by `%FS%`.
    pub zero_suppression: ZeroSuppression,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum OriginalUnit {
    #[serde(rename = "MM")]
    Mm,
    #[serde(rename = "IN")]
    In,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ZeroSuppression {
    #[serde(rename = "L")]
    Leading,
    #[serde(rename = "T")]
    Trailing,
    #[serde(rename = "D")]
    Explicit,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Aperture {
    /// D-code, always 10 or greater.
    pub code: u32,
    pub shape: ApertureShape,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ApertureShape {
    #[serde(rename_all = "camelCase")]
    Circle {
        diameter: f64,
        #[serde(skip_serializing_if = "Option::is_none")]
        hole_diameter: Option<f64>,
    },
    #[serde(rename_all = "camelCase")]
    Rectangle {
        width: f64,
        height: f64,
        #[serde(skip_serializing_if = "Option::is_none")]
        hole_diameter: Option<f64>,
    },
    #[serde(rename_all = "camelCase")]
    Obround {
        width: f64,
        height: f64,
        #[serde(skip_serializing_if = "Option::is_none")]
        hole_diameter: Option<f64>,
    },
    #[serde(rename_all = "camelCase")]
    Polygon {
        diameter: f64,
        vertices: u32,
        rotation_deg: f64,
    },
    #[serde(rename_all = "camelCase")]
    /// An aperture defined by `%AM%`, already evaluated to primitives.
    Macro {
        name: String,
        primitives: Vec<MacroPrimitive>,
    },
}

/// A single primitive inside an evaluated aperture macro.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MacroPrimitive {
    pub exposure: Exposure,
    pub shape: MacroShape,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Exposure {
    On,
    Off,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum MacroShape {
    #[serde(rename_all = "camelCase")]
    Circle {
        diameter: f64,
        center: Point,
        #[serde(skip_serializing_if = "Option::is_none")]
        rotation_deg: Option<f64>,
    },
    #[serde(rename_all = "camelCase")]
    VectorLine {
        width: f64,
        start: Point,
        end: Point,
        #[serde(skip_serializing_if = "Option::is_none")]
        rotation_deg: Option<f64>,
    },
    #[serde(rename_all = "camelCase")]
    CenterLine {
        width: f64,
        height: f64,
        center: Point,
        #[serde(skip_serializing_if = "Option::is_none")]
        rotation_deg: Option<f64>,
    },
    #[serde(rename_all = "camelCase")]
    LowerLeftLine {
        width: f64,
        height: f64,
        lower_left: Point,
        #[serde(skip_serializing_if = "Option::is_none")]
        rotation_deg: Option<f64>,
    },
    #[serde(rename_all = "camelCase")]
    Outline {
        vertices: Vec<Point>,
        #[serde(skip_serializing_if = "Option::is_none")]
        rotation_deg: Option<f64>,
    },
    #[serde(rename_all = "camelCase")]
    Polygon {
        vertices: u32,
        center: Point,
        diameter: f64,
        #[serde(skip_serializing_if = "Option::is_none")]
        rotation_deg: Option<f64>,
    },
    #[serde(rename_all = "camelCase")]
    Thermal {
        center: Point,
        outer_diameter: f64,
        inner_diameter: f64,
        gap: f64,
        #[serde(skip_serializing_if = "Option::is_none")]
        rotation_deg: Option<f64>,
    },
}

/// A single drawing operation, in source order.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum GraphicObject {
    #[serde(rename_all = "camelCase")]
    Flash {
        polarity: Polarity,
        aperture: u32,
        at: Point,
        source_offset: usize,
    },
    #[serde(rename_all = "camelCase")]
    Stroke {
        polarity: Polarity,
        aperture: u32,
        segments: Vec<Segment>,
        source_offset: usize,
    },
    #[serde(rename_all = "camelCase")]
    Region {
        polarity: Polarity,
        contours: Vec<Vec<Segment>>,
        source_offset: usize,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Polarity {
    Dark,
    Clear,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Segment {
    Line {
        to: Point,
    },
    #[serde(rename_all = "camelCase")]
    Arc {
        to: Point,
        center: Point,
        direction: ArcDirection,
        full_circle: bool,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ArcDirection {
    Clockwise,
    CounterClockwise,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StepRepeat {
    pub x_count: u32,
    pub y_count: u32,
    pub x_step: f64,
    pub y_step: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

impl Point {
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }
}
