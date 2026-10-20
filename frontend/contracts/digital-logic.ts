/** Hand-maintained mapping of contracts/schemas/v1/digital-logic-*.schema.json. */
export type LogicSignal = '0' | '1' | 'X' | 'Z'
export type LogicNodeKind = 'and' | 'or' | 'not' | 'nand' | 'nor' | 'xor' | 'xnor' | 'buf'
  | 'input' | 'clock' | 'dff' | 'probe' | 'hd44780'
export interface LogicNode { id: string; kind: LogicNodeKind }
export interface LogicEdge { id: string; source: string; target: string; targetPort: string }
export type LogicCommand =
  | { type: 'load'; nodes: LogicNode[]; edges: LogicEdge[]; values: Record<string, LogicSignal> }
  | { type: 'set_input'; nodeId: string; value: '0' | '1' }
  | { type: 'step'; ticks: number }
  | { type: 'reset' }
export interface LogicRequest {
  schemaVersion: 1
  projectId: string
  requestId: string
  inputRevision: number
  command: LogicCommand
}
export interface LogicDisplay { rows: [string, string]; cursor: number | null; displayOn: boolean }
export interface LogicDiagnostic { nodeId?: string; message: string }
export interface LogicResponse {
  schemaVersion: 1
  projectId: string
  requestId: string
  inputRevision: number
  tick: number
  outputs: Record<string, LogicSignal>
  inputs: Record<string, Record<string, LogicSignal>>
  displays: Record<string, LogicDisplay>
  diagnostics: LogicDiagnostic[]
}
