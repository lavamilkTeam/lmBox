import { beforeEach, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCircuitEditing } from '../index'
const editing = () => useCircuitEditing(() => ({ inputs: [{ id: 'A', x: 10, y: 50 }], output: { x: 190, y: 50 } }))
const document = () => ({ schemaVersion: 1, nodes: [
  { id: 'gate-1', gateId: 'input', label: 'RESET', x: 24, y: 24 },
  { id: 'screen', gateId: 'hd44780', scale: 3, x: 600, y: 24 },
], edges: [{ id: 'e', source: 'gate-1', target: 'screen', targetPort: 'E' }], inputValues: { 'gate-1': '1' } })
beforeEach(() => setActivePinia(createPinia()))
it('imports an independent editable document with names, scale and input intent', () => {
  const feature = editing(), source = document()
  expect(feature.importDocument(source)).toBe('')
  source.nodes[0]!.x = 999
  expect(feature.circuit.nodes[0]!.x).toBe(24)
  expect(feature.circuit.inputValues['gate-1']).toBe('1')
  expect(feature.circuit.nodes[1]!.scale).toBe(3)
  expect(feature.add('not', 50, 60)).not.toBe('gate-1')
})
it('rejects invalid documents atomically and catches cycles and duplicate drivers', () => {
  const feature = editing()
  feature.importDocument(document())
  const original = JSON.stringify(feature.circuit.$state)
  const d = document()
  for (const bad of [null, { ...d, schemaVersion: 2 }, { ...d, nodes: [...d.nodes, d.nodes[0]] },
    { ...d, edges: [...d.edges, { ...d.edges[0], id: 'e2' }] },
    { ...d, inputValues: { screen: '1' } }, { ...d, nodes: [{ ...d.nodes[0], x: Infinity }] },
    { ...d, nodes: [{ ...d.nodes[0], scale: 0 }] },
    { ...d, nodes: [{ id: 'n', gateId: 'not', x: 24, y: 24 }], edges: [{ id: 'e', source: 'n', target: 'n', targetPort: 'A' }], inputValues: {} },
  ]) {
    expect(feature.importDocument(bad)).not.toBe('')
    expect(JSON.stringify(feature.circuit.$state)).toBe(original)
  }
})
it('allows sequential feedback through a register', () => {
  const feature = editing()
  expect(feature.importDocument({ schemaVersion: 1, nodes: [
    { id: 'q', gateId: 'dff', x: 24, y: 24 }, { id: 'n', gateId: 'not', x: 400, y: 24 },
  ], edges: [{ id: 'a', source: 'q', target: 'n', targetPort: 'A' }, { id: 'b', source: 'n', target: 'q', targetPort: 'D' }], inputValues: {} })).toBe('')
})

it('replaces prior input values and allocates fresh wire IDs after import', () => {
  const feature = editing(), initial = document()
  feature.importDocument(initial)
  const source = feature.add('input', 500, 500)!
  const target = feature.add('buf', 800, 500)!
  const updated = { ...document(), nodes: [...initial.nodes, { id: 'buffer', gateId: 'buf', x: 900, y: 500 }],
    edges: [{ ...initial.edges[0]!, id: 'wire-1' }] }
  expect(feature.importDocument(updated)).toBe('')
  expect(feature.circuit.inputValues[source]).toBeUndefined()
  expect(feature.circuit.nodes.some(node => node.id === target)).toBe(false)
  expect(feature.connect('gate-1', 'buffer', 'A')).toBe('')
  expect(new Set(feature.circuit.edges.map(edge => edge.id)).size).toBe(2)
})
