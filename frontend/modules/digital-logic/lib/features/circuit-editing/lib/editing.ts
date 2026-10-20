import { parseDocument } from './document'
import { circuitComponents, useLogicCircuit } from '../../../domain/circuit'

interface PortLayout {
  inputs: readonly { id: string; x: number; y: number; side?: 'left' | 'top' }[]
  output: { x: number; y: number } | null
}

export function useCircuitEditing(portsForComponent: (componentId: string, inputs: readonly string[]) => PortLayout) {
  const circuit = useLogicCircuit()
  function snappedY(id: string, x: number, y: number, edges = circuit.edges) {
    let nearestY = y, nearestDistance = Infinity
    for (const edge of edges) {
      if (edge.source !== id && edge.target !== id) continue
      const from = circuit.nodes.find(node => node.id === edge.source)
      const to = circuit.nodes.find(node => node.id === edge.target)
      if (!from || !to) continue
      const fromGate = circuitComponents.find(component => component.id === from.gateId)
      const toGate = circuitComponents.find(component => component.id === to.gateId)
      if (!fromGate || !toGate) continue
      const output = portsForComponent(from.gateId, fromGate.inputs).output
      const input = portsForComponent(to.gateId, toGate.inputs).inputs.find(port => port.id === edge.targetPort)
      if (!output || !input || input.side === 'top' || ![output.x, output.y, input.x, input.y].every(Number.isFinite)) continue
      const movingSource = edge.source === id
      const sourceX = (movingSource ? x : from.x) + output.x * (from.scale ?? 1)
      const targetX = (movingSource ? to.x : x) + input.x * (to.scale ?? 1)
      if (targetX <= sourceX) continue
      const candidate = movingSource ? to.y + input.y * (to.scale ?? 1) - output.y * (from.scale ?? 1) : from.y + output.y * (from.scale ?? 1) - input.y * (to.scale ?? 1)
      const distance = Math.abs(candidate - y)
      if (candidate >= 24 && distance <= 12 && distance < nearestDistance) {
        nearestY = candidate
        nearestDistance = distance
      }
    }
    return nearestY
  }
  function nextId(prefix: string) {
    let id: string
    do { id = `${prefix}-${circuit.nextId++}` } while (circuit.nodes.some(node => node.id === id) || circuit.edges.some(edge => edge.id === id))
    return id
  }
  function add(gateId: string, x: number, y: number) {
    const component = circuitComponents.find(component => component.id === gateId)
    if (!component || !Number.isFinite(x) || !Number.isFinite(y)) return
    const id = nextId('gate')
    if (gateId === 'input') circuit.inputValues[id] = '0'
    circuit.nodes.push({ id, gateId: component.id, x: Math.max(24, x), y: Math.max(24, y) })
    return id
  }
  function importDocument(value: unknown) {
    try {
      const document = parseDocument(value)
      circuit.$patch(state => {
        state.nodes = document.nodes; state.edges = document.edges
        state.inputValues = document.inputValues; state.nextId = 1
      })
      return ''
    } catch (error) { return error instanceof Error ? error.message : '电路文件无效' }
  }
  function move(id: string, x: number, y: number) {
    const node = circuit.nodes.find(node => node.id === id)
    if (node && Number.isFinite(x) && Number.isFinite(y)) {
      node.x = Math.max(24, x)
      node.y = snappedY(id, node.x, Math.max(24, y))
    }
  }
  function connect(source: string, target: string, targetPort?: string) {
    const from = circuit.nodes.find(node => node.id === source)
    const to = circuit.nodes.find(node => node.id === target)
    if (!from || !to) return '元件已不存在'
    if (source === target && from.gateId !== 'dff') return '请选择另一个元件'
    if (!circuitComponents.find(component => component.id === from.gateId)?.hasOutput) return '该元件没有可连接的输出端'
    const gate = circuitComponents.find(component => component.id === to.gateId)!
    if (!gate.inputs.some(port => port === targetPort)) return '请选择有效的输入端'
    if (circuit.edges.some(edge => edge.target === target && edge.targetPort === targetPort)) return '该输入端已连接，请先删除原连线'
    const visited = new Set<string>()
    function reaches(id: string): boolean {
      if (circuit.nodes.find(node => node.id === id)?.gateId === 'dff') return false
      if (id === source) return true
      if (visited.has(id)) return false
      visited.add(id)
      return circuit.edges.filter(edge => edge.source === id).some(edge => reaches(edge.target))
    }
    if (reaches(target)) return '组合逻辑反馈必须经过触发器'
    const edge = { id: nextId('wire'), source, target, targetPort: targetPort! }
    circuit.edges.push(edge)
    to.y = snappedY(target, to.x, to.y, [edge])
    return ''
  }
  function removeNode(id: string) {
    circuit.nodes = circuit.nodes.filter(node => node.id !== id)
    circuit.edges = circuit.edges.filter(edge => edge.source !== id && edge.target !== id)
    delete circuit.inputValues[id]
  }
  function removeEdge(id: string) { circuit.edges = circuit.edges.filter(edge => edge.id !== id) }
  return { importDocument, circuit, tools: circuitComponents, add, move, connect, removeNode, removeEdge }
}
