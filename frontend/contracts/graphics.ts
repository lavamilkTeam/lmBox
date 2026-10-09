// Graphics IR — frontend binding of `contracts/schemas/v2/graphics.schema.json`.
//
// These types mirror the JSON produced by the Rust `board_import` parser. All
// lengths are millimetres. Rendering consumes this data; contouring, offset
// and meshing remain the Python engine's responsibility.

export type Unit = 'mm'
export type OriginalUnit = 'MM' | 'IN'
export type ZeroSuppression = 'L' | 'T' | 'D'
export type Exposure = 'on' | 'off'
export type Polarity = 'dark' | 'clear'
export type ArcDirection = 'clockwise' | 'counterclockwise'

export interface Point {
  x: number
  y: number
}

export interface GraphicsIr {
  schemaVersion: string
  unit: Unit
  apertures: Aperture[]
  objects: GraphicObject[]
  stepAndRepeat?: StepRepeat
  source: SourceInfo
}

export interface SourceInfo {
  originalUnit: OriginalUnit
  coordinateFormat?: string
  zeroSuppression: ZeroSuppression
}

export interface Aperture {
  code: number
  shape: ApertureShape
}

export type ApertureShape =
  | { type: 'circle'; diameter: number; holeDiameter?: number }
  | { type: 'rectangle'; width: number; height: number; holeDiameter?: number }
  | { type: 'obround'; width: number; height: number; holeDiameter?: number }
  | { type: 'polygon'; diameter: number; vertices: number; rotationDeg: number }
  | { type: 'macro'; name: string; primitives: MacroPrimitive[] }

export interface MacroPrimitive {
  exposure: Exposure
  shape: MacroShape
}

export type MacroShape =
  | { type: 'circle'; diameter: number; center: Point; rotationDeg?: number }
  | { type: 'vectorLine'; width: number; start: Point; end: Point; rotationDeg?: number }
  | { type: 'centerLine'; width: number; height: number; center: Point; rotationDeg?: number }
  | {
      type: 'lowerLeftLine'
      width: number
      height: number
      lowerLeft: Point
      rotationDeg?: number
    }
  | { type: 'outline'; vertices: Point[]; rotationDeg?: number }
  | { type: 'polygon'; vertices: number; center: Point; diameter: number; rotationDeg?: number }
  | {
      type: 'thermal'
      center: Point
      outerDiameter: number
      innerDiameter: number
      gap: number
      rotationDeg?: number
    }

export type GraphicObject =
  | { kind: 'flash'; polarity: Polarity; aperture: number; at: Point; sourceOffset: number }
  | {
      kind: 'stroke'
      polarity: Polarity
      aperture: number
      start: Point
      segments: Segment[]
      sourceOffset: number
    }
  | { kind: 'region'; polarity: Polarity; contours: Contour[]; sourceOffset: number }

export interface Contour {
  start: Point
  segments: Segment[]
}

export type Segment =
  | { type: 'line'; to: Point }
  | { type: 'arc'; to: Point; center: Point; direction: ArcDirection; fullCircle: boolean }

export interface StepRepeat {
  xCount: number
  yCount: number
  xStep: number
  yStep: number
}
