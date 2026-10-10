/** Manual mapping of the CFD session v1 contract; native values remain backend-owned. */
export type CfdValue = null | boolean | number | string | CfdValue[] | { [key: string]: CfdValue }
export type CfdOperation = 'initialize' | 'command' | 'inspect' | 'poll' | 'setField' | 'clickField' | 'editorAccept' | 'editorReject' | 'selectGeometry' | 'selectObject' | 'editObject' | 'deleteObject' | 'setVisibility' | 'undo' | 'redo' | 'setProperty' | 'importFile' | 'exportDocument' | 'dialogResponse' | 'close'
export interface CfdRequest {
  schemaVersion: 1
  projectId: string
  requestId: string
  expectedRevision: number
  operation: CfdOperation
  payload: Record<string, CfdValue>
}
export interface CfdUiNode {
  id: string
  kind: string
  qtClass: string
  name: string
  label?: string
  tooltip?: string
  value?: CfdValue
  options?: string[]
  enabled: boolean
  visible: boolean
  readOnly?: boolean
  minimum?: number
  maximum?: number
  step?: number
  unit?: string
  layout?: { type: string; columns?: number }
  placement?: { row: number; column: number; rowSpan?: number; columnSpan?: number }
  children?: CfdUiNode[]
  items?: { id: string; label: string; selected?: boolean; checked?: boolean; checkState?: number; enabled?: boolean }[]
  rows?: { id: string; parentId: string | null; label: string; columns: string[]; selected: boolean; expanded: boolean; checkState?: number }[]
  headers?: string[]
  cells?: string[][]
}
export interface CfdProperty {
  name: string
  type: string
  group: string
  readOnly: boolean
  value: CfdValue
  options?: string[]
}
export interface CfdGeometry {
  objectId: string
  label: string
  vertices: number[]
  triangles: number[]
  faces: { id: string; firstTriangle: number; triangleCount: number }[]
  edges: { id: string; vertices: number[] }[]
  points: { id: string; position: [number, number, number] }[]
  solids: { id: string; faces: string[] }[]
}
export interface CfdPlot {
  id: string
  title: string
  xLabel: string
  yLabel: string
  xScale?: 'linear' | 'log'
  yScale?: 'linear' | 'log'
  logarithmic?: boolean
  series: { name: string; points: [number, number][] }[]
}
export interface CfdState {
  revision: number
  runtime: { freecadVersion: string; upstreamCommit?: string }
  capabilities: Record<string, CfdValue>
  commands: { id: string; label: string; tooltip: string; enabled: boolean; upstreamEnabled?: boolean; commands?: string[] }[]
  document: { name: string; label: string; objects: { id: string; label: string; type: string; visible: boolean; parentId?: string | null; properties: CfdProperty[] }[] }
  selection: { objectId: string; subelements: string[] }[]
  editor: null | { id: string; title: string; objectId: string | null; roots: CfdUiNode[]; actions: { accept: boolean; reject: boolean; acceptLabel?: string; rejectLabel?: string } }
  dialogs: { id: string; title: string; text: string; roots?: CfdUiNode[]; buttons: { id: string; label: string; role: string; enabled?: boolean }[];
    fileDialog?: { mode: 'directory' | 'saveFile' | 'openFile'; fileMode: 'file' | 'files' | 'directory' | 'any'; acceptMode: 'save' | 'open'; filters: string[]; selectedFilter: string; title: string } }[]
  geometry: CfdGeometry[]
  plots: CfdPlot[]
  logs: { level: string; text: string }[]
  busy: boolean
  pendingAction: null | { requestId: string; operation: string }
  lastAction?: null | { requestId: string; operation: string; ok: boolean; error?: string }
}
export interface CfdResponse {
  schemaVersion: 1
  projectId: string
  requestId: string
  inputRevision: number
  revision: number
  ok: boolean
  state?: CfdState
  error?: { code: string; message: string }
  artifact?: { name: string; base64: string }
}
