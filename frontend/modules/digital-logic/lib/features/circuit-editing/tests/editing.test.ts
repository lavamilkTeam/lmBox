import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCircuitEditing } from '../index'

// Deliberately use a different symbol layout to verify the injected port coordinates.
const ports = (componentId: string, inputs: readonly string[]) => ({
  inputs: inputs.map((id, index) => componentId === 'hd44780'
    ? { id, x: 80 + index * 24, y: 20, side: 'top' as const }
    : { id, x: 8, y: inputs.length === 1 ? 45 : 25 + index * 40 }),
  output: componentId === 'hd44780' ? null : { x: 150, y: 45 },
})
const createEditing = () => useCircuitEditing(ports)

describe('logic circuit draft', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('allows fan-out and distinct A/B connections but never multiple drivers on one input', () => {
    const editing = createEditing()
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
    const editing = createEditing()
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
    const editing = createEditing()
    const circuit = editing.circuit
    for (const gate of editing.tools) expect(editing.add(gate.id, 40, 40)).toBeDefined()
    expect(editing.add('unknown', 40, 40)).toBeUndefined()
    expect(editing.add('and', NaN, 40)).toBeUndefined()
    const id = editing.add('and', -10, -20)!
    expect(circuit.nodes.at(-1)).toMatchObject({ id, x: 24, y: 24 })
    editing.move(id, 300, 450)
    editing.move(id, Infinity, 40)
    expect(createEditing().circuit.nodes.at(-1)).toMatchObject({ id, x: 300, y: 450 })
    expect(new Set(circuit.nodes.map(node => node.id)).size).toBe(circuit.nodes.length)
  })
  it('accepts the LCD digital pins, rejects non-digital pins and never uses the display as a source', () => {
    // Source capability belongs to the catalog, even if an injected layout supplies an output.
    const editing = useCircuitEditing((id, inputs) => ({ ...ports(id, inputs), output: { x: 150, y: 45 } }))
    const source = editing.add('buf', 40, 40)!, display = editing.add('hd44780', 400, 200)!
    const inputs = ['RS', 'R/W', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']
    for (const input of inputs) expect(editing.connect(source, display, input)).toBe('')
    expect(editing.connect(source, display, 'E')).not.toBe('')
    for (const pin of ['VSS', 'VDD', 'V0', 'A', 'K']) expect(editing.connect(source, display, pin)).not.toBe('')
    expect(editing.connect(display, source, 'A')).not.toBe('')
    expect(editing.circuit.edges).toHaveLength(11)
    editing.removeNode(display)
    expect(editing.circuit.edges).toEqual([])
  })
  it('leaves top-facing LCD pins unsnapped when connecting and moving either endpoint', () => {
    const editing = createEditing()
    const source = editing.add('not', 40, 100)!, display = editing.add('hd44780', 400, 130)!
    expect(editing.connect(source, display, 'E')).toBe('')
    expect(editing.circuit.nodes[1]!.y).toBe(130)
    editing.move(display, 420, 132)
    editing.move(source, 40, 102)
    expect(editing.circuit.nodes.map(node => node.y)).toEqual([102, 132])
  })
  it('aligns the named input after a valid near-horizontal connection without moving the source', () => {
    const editing = createEditing()
    const a = editing.add('not', 40, 100)!, b = editing.add('and', 200, 88)!
    expect(editing.connect(a, b, 'B')).toBe('')
    expect(editing.circuit.nodes).toMatchObject([{ id: a, y: 100 }, { id: b, y: 80 }])
    // Rejected attempts leave both positions and the existing wire intact.
    const before = JSON.stringify(editing.circuit.nodes)
    expect(editing.connect(a, b, 'B')).not.toBe('')
    expect(editing.connect(b, a, 'A')).not.toBe('')
    expect(JSON.stringify(editing.circuit.nodes)).toBe(before)
    expect(editing.circuit.edges).toHaveLength(1)
  })
  it('snaps either end using the requested position and releases beyond the threshold', () => {
    const editing = createEditing()
    const a = editing.add('not', 40, 100)!, b = editing.add('and', 400, 200)!
    editing.connect(a, b, 'A')
    const [source, target] = editing.circuit.nodes
    editing.move(b, 430, 132)
    expect(target).toMatchObject({ x: 430, y: 120 })
    editing.move(b, 440, 133)
    expect(target).toMatchObject({ x: 440, y: 133 })
    editing.move(a, 50, 105)
    expect(source).toMatchObject({ x: 50, y: 113 })
    expect(target!.y).toBe(133)
    // The keyboard's 20-unit step can leave a snapped alignment.
    editing.move(a, 50, source!.y + 20)
    expect(source!.y).toBe(133)
    editing.removeEdge(editing.circuit.edges[0]!.id)
    editing.move(a, 50, 118)
    expect(source!.y).toBe(118)
  })
  it('chooses the closest connected anchor with stable ties and never moves its neighbours', () => {
    const editing = createEditing()
    const a = editing.add('not', 40, 100)!, b = editing.add('not', 400, 200)!, c = editing.add('buf', 650, 300)!
    editing.connect(a, b, 'A')
    editing.connect(a, c, 'A')
    editing.move(b, 400, 100)
    editing.move(c, 650, 118)
    editing.move(a, 40, 110)
    expect(editing.circuit.nodes.map(node => node.y)).toEqual([118, 100, 118])
    editing.move(a, 40, 109)
    expect(editing.circuit.nodes.map(node => node.y)).toEqual([100, 100, 118])
  })
  it('uses only the new edge when aligning a newly connected target', () => {
    const editing = createEditing()
    const a = editing.add('not', 40, 188)!, b = editing.add('and', 400, 200)!, c = editing.add('buf', 650, 210)!
    editing.connect(b, c, 'A')
    // c is aligned to b. The new connection must still align b with a, not c.
    expect(editing.connect(a, b, 'A')).toBe('')
    expect(editing.circuit.nodes.map(node => node.y)).toEqual([188, 208, 200])
  })
  it('keeps large offsets, backward wires and positions outside the canvas margin unsnapped', () => {
    const editing = createEditing()
    const a = editing.add('not', 400, 100)!, b = editing.add('not', 40, 108)!
    editing.connect(a, b, 'A')
    expect(editing.circuit.nodes[1]!.y).toBe(108)
    editing.move(b, 45, 105)
    expect(editing.circuit.nodes[1]!.y).toBe(105)
    const c = editing.add('and', 700, 24)!
    editing.move(a, 400, 34)
    editing.connect(a, c, 'B') // Exact alignment would put c at y=14.
    expect(editing.circuit.nodes[2]!.y).toBe(24)
    editing.move(c, 700, 25)
    expect(editing.circuit.nodes[2]!.y).toBe(25)
    const d = editing.add('buf', 1000, 100)!
    editing.connect(c, d, 'A')
    expect(editing.circuit.nodes[3]!.y).toBe(100)
  })
  it('ignores unusable injected geometry without breaking normal editing or creating NaN positions', () => {
    const editing = useCircuitEditing((_id, inputs) => ({
      ...ports(_id, inputs), output: { x: 150, y: NaN },
    }))
    const a = editing.add('not', 40, 100)!, b = editing.add('buf', 400, 108)!
    expect(editing.connect(a, b, 'A')).toBe('')
    editing.move(b, 420, 105)
    expect(editing.circuit.nodes[1]).toMatchObject({ x: 420, y: 105 })
    expect(editing.circuit.edges).toHaveLength(1)
  })
})
