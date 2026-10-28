import { circuitComponents } from '../../../domain/circuit'
import type { useLogicCircuit } from '../../../domain/circuit'

type Circuit = ReturnType<typeof useLogicCircuit>
type Document = Pick<Circuit, 'nodes' | 'edges' | 'inputValues'>
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)

export function parseDocument(value: unknown): Document {
  if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.nodes) || !Array.isArray(value.edges)
    || value.nodes.length > 512 || value.edges.length > 4096 || !record(value.inputValues)) throw Error('电路文件格式或大小无效')
  const nodes: Document['nodes'] = [], edges: Document['edges'] = [], inputValues: Document['inputValues'] = {}
  const ids = new Set<string>(), edgeIds = new Set<string>(), driven = new Set<string>()
  for (const node of value.nodes) {
    if (!record(node) || !id(node.id) || ids.has(node.id)) throw Error('元件标识无效或重复')
    const component = circuitComponents.find(component => component.id === node.gateId)
    if (!component || typeof node.x !== 'number' || typeof node.y !== 'number'
      || ![node.x, node.y].every(n => Number.isFinite(n) && n >= 24 && n <= 100000)
      || (node.label !== undefined && (typeof node.label !== 'string' || !node.label.trim() || node.label.length > 80))) throw Error('元件类型、名称或位置无效')
    if (node.scale !== undefined && (typeof node.scale !== 'number' || !Number.isFinite(node.scale) || node.scale < 1 || node.scale > 4)) throw Error('元件显示比例无效')
    ids.add(node.id)
    nodes.push({ id: node.id, gateId: component.id, x: node.x, y: node.y, ...(typeof node.scale === 'number' ? { scale: node.scale } : {}), ...(typeof node.label === 'string' ? { label: node.label } : {}) })
  }
  const byId = new Map(nodes.map(node => [node.id, node]))
  for (const edge of value.edges) {
    if (!record(edge) || !id(edge.id) || edgeIds.has(edge.id) || !id(edge.source) || !id(edge.target) || typeof edge.targetPort !== 'string') throw Error('连线标识无效或重复')
    const from = byId.get(edge.source), to = byId.get(edge.target)
    const source = circuitComponents.find(component => component.id === from?.gateId)
    const target = circuitComponents.find(component => component.id === to?.gateId)
    const key = `${edge.target}:${edge.targetPort}`
    if (!source?.hasOutput || !target?.inputs.some(port => port === edge.targetPort) || driven.has(key)) throw Error('连线端口无效或存在多个驱动')
    edgeIds.add(edge.id); driven.add(key)
    edges.push({ id: edge.id, source: edge.source, target: edge.target, targetPort: edge.targetPort })
  }
  const visiting = new Set<string>(), visited = new Set<string>()
  function visit(nodeId: string) {
    if (visiting.has(nodeId)) throw Error('组合逻辑反馈必须经过触发器')
    if (visited.has(nodeId)) return
    visiting.add(nodeId)
    for (const edge of edges) if (edge.source === nodeId && byId.get(edge.target)?.gateId !== 'dff') visit(edge.target)
    visiting.delete(nodeId); visited.add(nodeId)
  }
  for (const node of nodes) visit(node.id)
  for (const [nodeId, signal] of Object.entries(value.inputValues)) {
    if (byId.get(nodeId)?.gateId !== 'input' || (signal !== '0' && signal !== '1')) throw Error('输入开关电平无效')
    inputValues[nodeId] = signal
  }
  for (const node of nodes) if (node.gateId === 'input') inputValues[node.id] ??= '0'
  return { nodes, edges, inputValues }
}
