export type CircuitSignal = '0' | '1' | 'X' | 'Z'

export interface CircuitDisplay {
  rows: readonly [string, string]
  cursor: number | null
  displayOn: boolean
}

export interface SimulationView {
  busy: boolean
  running: boolean
  error: string | null
  result: {
    tick: number
    outputs: Readonly<Record<string, CircuitSignal>>
    inputs: Readonly<Record<string, Readonly<Record<string, CircuitSignal>>>>
    displays: Readonly<Record<string, CircuitDisplay>>
    diagnostics: readonly { nodeId?: string; message: string }[]
  } | null
  values: Readonly<Record<string, '0' | '1'>>
  highEdgeIds: readonly string[]
  status: string
}
