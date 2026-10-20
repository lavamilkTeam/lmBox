import type { LogicDiagnostic, LogicDisplay, LogicRequest, LogicResponse, LogicSignal } from '../../../contracts'

const idPattern = /^[A-Za-z0-9_-]{1,128}$/
const kinds = ['and', 'or', 'not', 'nand', 'nor', 'xor', 'xnor', 'buf', 'input', 'clock', 'dff', 'probe', 'hd44780']
const malformed = () => new Error('数字逻辑数据格式无效或超过限制。')
const id = (value: unknown): value is string => typeof value === 'string' && idPattern.test(value)
const port = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_/-]{1,128}$/.test(value)
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const signal = (value: unknown): value is LogicSignal => value === '0' || value === '1' || value === 'X' || value === 'Z'

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function fields(value: unknown, required: string[], optional: string[] = []): value is Record<string, unknown> {
  return record(value) && required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => required.includes(key) || optional.includes(key))
}
function map<T>(value: unknown, parse: (value: unknown) => T, limit = 512, validKey = id): Record<string, T> {
  if (!record(value) || Object.keys(value).length > limit) throw malformed()
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (!validKey(key)) throw malformed()
    return [key, parse(entry)]
  }))
}
function readSignal(value: unknown): LogicSignal {
  if (!signal(value)) throw malformed()
  return value
}
function display(value: unknown): LogicDisplay {
  if (!fields(value, ['rows', 'cursor', 'displayOn']) || !Array.isArray(value.rows) || value.rows.length !== 2
    || !value.rows.every(row => typeof row === 'string' && [...row].length === 16)
    || !(value.cursor === null || integer(value.cursor) && value.cursor < 32) || typeof value.displayOn !== 'boolean') throw malformed()
  return { rows: [value.rows[0], value.rows[1]], cursor: value.cursor, displayOn: value.displayOn }
}
function diagnostic(value: unknown): LogicDiagnostic {
  if (!fields(value, ['message'], ['nodeId']) || typeof value.message !== 'string'
    || !value.message.length || [...value.message].length > 4096
    || Object.hasOwn(value, 'nodeId') && !id(value.nodeId)) throw malformed()
  return { message: value.message, ...(typeof value.nodeId === 'string' ? { nodeId: value.nodeId } : {}) }
}

export function validateRequest(value: LogicRequest): void {
  if (!fields(value, ['schemaVersion', 'projectId', 'requestId', 'inputRevision', 'command'])
    || value.schemaVersion !== 1 || !id(value.projectId) || !id(value.requestId) || !integer(value.inputRevision)) throw malformed()
  const command = value.command
  if (!record(command)) throw malformed()
  if (command.type === 'load') {
    if (!fields(command, ['type', 'nodes', 'edges', 'values']) || !Array.isArray(command.nodes) || command.nodes.length > 512
      || !Array.isArray(command.edges) || command.edges.length > 4096) throw malformed()
    for (const node of command.nodes) {
      if (!fields(node, ['id', 'kind']) || !id(node.id) || typeof node.kind !== 'string' || !kinds.includes(node.kind)) throw malformed()
    }
    for (const edge of command.edges) {
      if (!fields(edge, ['id', 'source', 'target', 'targetPort']) || !id(edge.id) || !id(edge.source) || !id(edge.target) || !port(edge.targetPort)) throw malformed()
    }
    map(command.values, readSignal)
  } else if (command.type === 'set_input') {
    if (!fields(command, ['type', 'nodeId', 'value']) || !id(command.nodeId) || command.value !== '0' && command.value !== '1') throw malformed()
  } else if (command.type === 'step') {
    if (!fields(command, ['type', 'ticks']) || !integer(command.ticks) || command.ticks < 1 || command.ticks > 1000) throw malformed()
  } else if (command.type !== 'reset' || !fields(command, ['type'])) throw malformed()
}

export function readResponse(value: unknown, expected: Pick<LogicRequest, 'projectId' | 'requestId' | 'inputRevision'>): LogicResponse {
  if (!record(value) || value.schemaVersion !== 1 || value.projectId !== expected.projectId
    || value.requestId !== expected.requestId || value.inputRevision !== expected.inputRevision) throw new Error('数字逻辑结果与当前请求不匹配。')
  if (!fields(value, ['schemaVersion', 'projectId', 'requestId', 'inputRevision', 'tick', 'outputs', 'inputs', 'displays', 'diagnostics'])
    || !integer(value.tick) || !Array.isArray(value.diagnostics) || value.diagnostics.length > 512) throw malformed()
  return {
    schemaVersion: 1, ...expected, tick: value.tick,
    outputs: map(value.outputs, readSignal),
    inputs: map(value.inputs, ports => map(ports, readSignal, 16, port)),
    displays: map(value.displays, display), diagnostics: value.diagnostics.map(diagnostic),
  }
}
