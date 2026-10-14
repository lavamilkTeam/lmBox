/** Pure display data. Native protocol adaptation belongs to the feature/app layers. */
export type UiValue = null | boolean | number | string | UiValue[] | { [key: string]: UiValue }
export interface UiTreeRow { id: string; parentId: string | null; label: string; columns: string[]; selected: boolean; expanded: boolean; checkState?: number }
export interface UiNode {
  id: string; kind: string; qtClass: string; name: string; label?: string; tooltip?: string; value?: UiValue
  options?: string[]; enabled: boolean; visible: boolean; readOnly?: boolean
  minimum?: number; maximum?: number; step?: number; unit?: string
  layout?: { type: string; columns?: number }
  placement?: { row: number; column: number; rowSpan?: number; columnSpan?: number }
  children?: UiNode[]; rows?: UiTreeRow[]; headers?: string[]; cells?: string[][]
  items?: { id: string; label: string; selected?: boolean; checked?: boolean; checkState?: number; enabled?: boolean }[]
}
export interface UiGeometry { objectId: string; label: string; vertices: number[]; triangles: number[]; faces: { id: string; firstTriangle: number; triangleCount: number }[]; edges?: { id: string; vertices: number[] }[]; points?: { id: string; position: [number,number,number] }[]; solids?: { id: string; faces: string[] }[] }
export interface UiPlot { id: string; title: string; xLabel: string; yLabel: string; xScale?: string; yScale?: string; series: { name: string; points: [number, number][] }[] }
export interface UiProperty { name: string; type: string; group: string; readOnly: boolean; value: UiValue; options?: string[] }
export type FieldPhase = 'input' | 'commit'

export interface UiFieldMesh { vertices: number[]; triangles: number[]; fields: Record<string, number[]>; truncated: boolean }
export interface UiFlowData {
  id: string; time: number; coordinateUnit: 'm'
  fields: { id: string; label: string; unit: string; range: [number, number] }[]
  surface: UiFieldMesh; slice: UiFieldMesh
  streamlines: { vertices: number[]; segments: number[]; fields: Record<string, number[]>; truncated: boolean }
  vectors: { positions: number[]; values: number[]; fields: Record<string, number[]> }
}
