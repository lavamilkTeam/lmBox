import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCircuitEditing } from '../index'

describe('logic circuit draft', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('allows fan-out and distinct A/B connections but never multiple drivers on one input', () => {
    const editing = useCircuitEditing()
    const circuit = editing.circuit
    const a = editing.add('not', 40, 40)!, b = editing.add('and', 350, 40)!, c = editing.add('buf', 650, 40)!
    expect(editing.connect(a, b, 'A')).toBe('')
    expect(editing.connect(a, b, 'B')).toBe('')
    expect(editing.connect(a, c, 'A')).toBe('')
    expect(editing.connect(c, b, 'A')).not.toBe('')
    expect(circuit.edges).toHaveLength(3)
    editing.removeEdge(circuit.edges[0]!.id)
    expect(editing.connect(c, b, 'A')).toBe('')
  })
  it('rejects nonexistent ports, deleted nodes, self-connections and feedback without mutating wires', () => {
    const editing = useCircuitEditing()
    const circuit = editing.circuit
    const a = editing.add('and', 40, 40)!, b = editing.add('not', 350, 40)!, c = editing.add('buf', 650, 40)!
    expect(editing.connect(a, b, 'B')).not.toBe('')
    expect(editing.connect(a, b)).not.toBe('')
    expect(editing.connect(a, 'missing', 'A')).not.toBe('')
    expect(editing.connect(a, a, 'A')).not.toBe('')
    expect(editing.connect(a, b, 'A')).toBe('')
    expect(editing.connect(b, c, 'A')).toBe('')
    expect(editing.connect(c, a, 'B')).not.toBe('')
    expect(circuit.edges).toHaveLength(2)
    editing.removeNode(b)
    expect(circuit.edges).toEqual([])
    expect(editing.connect(a, b, 'A')).not.toBe('')
  })
  it('retains repeated gates as separate finite-position nodes in the same session', () => {
    const editing = useCircuitEditing()
    const circuit = editing.circuit
    for (const gate of editing.tools) expect(editing.add(gate.id, 40, 40)).toBeDefined()
    expect(editing.add('unknown', 40, 40)).toBeUndefined()
    expect(editing.add('and', NaN, 40)).toBeUndefined()
    const id = editing.add('and', -10, -20)!
    expect(circuit.nodes.at(-1)).toMatchObject({ id, x: 24, y: 24 })
    editing.move(id, 300, 450)
    editing.move(id, Infinity, 40)
    expect(useCircuitEditing().circuit.nodes.at(-1)).toMatchObject({ id, x: 300, y: 450 })
    expect(new Set(circuit.nodes.map(node => node.id)).size).toBe(circuit.nodes.length)
  })
})
