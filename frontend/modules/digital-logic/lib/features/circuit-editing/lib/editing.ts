import { logicGates, useLogicCircuit } from '../../../domain/circuit'

interface PortLayout {
  inputs: readonly { id: string; x: number; y: number }[]
  output: { x: number; y: number }
}

export function useCircuitEditing(portsForGate: (gateId: string, inputs: readonly string[]) => PortLayout) {
  const circuit = useLogicCircuit()
  function snappedY(id: string, x: number, y: number, edges = circuit.edges) {
    let nearestY = y, nearestDistance = Infinity
    for (const edge of edges) {
      if (edge.source !== id && edge.target !== id) continue
      const from = circuit.nodes.find(node => node.id === edge.source)
      const to = circuit.nodes.find(node => node.id === edge.target)
      if (!from || !to) continue
      const fromGate = logicGates.find(gate => gate.id === from.gateId)
      const toGate = logicGates.find(gate => gate.id === to.gateId)
      if (!fromGate || !toGate) continue
      const output = portsForGate(from.gateId, fromGate.inputs).output
      const input = portsForGate(to.gateId, toGate.inputs).inputs.find(port => port.id === edge.targetPort)
      if (!input || ![output.x, output.y, input.x, input.y].every(Number.isFinite)) continue
      const movingSource = edge.source === id
      const sourceX = (movingSource ? x : from.x) + output.x
      const targetX = (movingSource ? to.x : x) + input.x
      if (targetX <= sourceX) continue
      const candidate = movingSource ? to.y + input.y - output.y : from.y + output.y - input.y
      const distance = Math.abs(candidate - y)
      if (candidate >= 24 && distance <= 12 && distance < nearestDistance) {
        nearestY = candidate
        nearestDistance = distance
      }
    }
    return nearestY
  }
  function add(gateId: string, x: number, y: number) {
    if (!logicGates.some(gate => gate.id === gateId) || !Number.isFinite(x) || !Number.isFinite(y)) return
    const id = `gate-${circuit.nextId++}`
    circuit.nodes.push({ id, gateId, x: Math.max(24, x), y: Math.max(24, y) })
    return id
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
    if (!from || !to) return '逻辑门已不存在'
    if (source === target) return '请选择另一个逻辑门'
    const gate = logicGates.find(gate => gate.id === to.gateId)!
    if (!gate.inputs.some(port => port === targetPort)) return '请选择有效的输入端'
    if (circuit.edges.some(edge => edge.target === target && edge.targetPort === targetPort)) return '该输入端已连接，请先删除原连线'
    const visited = new Set<string>()
    function reaches(id: string): boolean {
      if (id === source) return true
      if (visited.has(id)) return false
      visited.add(id)
      return circuit.edges.filter(edge => edge.source === id).some(edge => reaches(edge.target))
    }
    if (reaches(target)) return '暂不支持反馈回路'
    const edge = { id: `wire-${circuit.nextId++}`, source, target, targetPort: targetPort! }
    circuit.edges.push(edge)
    to.y = snappedY(target, to.x, to.y, [edge])
    return ''
  }
  function removeNode(id: string) {
    circuit.nodes = circuit.nodes.filter(node => node.id !== id)
    circuit.edges = circuit.edges.filter(edge => edge.source !== id && edge.target !== id)
  }
  function removeEdge(id: string) { circuit.edges = circuit.edges.filter(edge => edge.id !== id) }
  return { circuit, tools: logicGates, add, move, connect, removeNode, removeEdge }
}
