import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGuideFlow } from '../index'

describe('guide flow draft', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('rejects invalid, duplicate and cyclic connections while allowing branches', () => {
    const flow = useGuideFlow()
    const a = flow.add('equilibrium', 50, 50)!, b = flow.add('rocket', 350, 50)!, c = flow.add('nozzle', 650, 50)!
    expect(flow.connect(a, a)).not.toBe('')
    expect(flow.connect(a, 'missing')).not.toBe('')
    expect(flow.connect(a, b)).toBe('')
    expect(flow.connect(a, b)).not.toBe('')
    expect(flow.connect(b, c)).toBe('')
    expect(flow.connect(c, a)).not.toBe('')
    expect(flow.connect(a, c)).toBe('')
    expect(flow.edges).toHaveLength(3)
    flow.removeNode(b)
    expect(flow.edges).toMatchObject([{ source: a, target: c }])
    flow.removeEdge(flow.edges[0]!.id)
    expect(flow.edges).toEqual([])
  })
  it('accepts repeated tools as distinct nodes and keeps positions finite and inside the canvas', () => {
    const flow = useGuideFlow()
    expect(flow.add('unknown', 1, 2)).toBeUndefined()
    expect(flow.add('nozzle', NaN, 2)).toBeUndefined()
    const a = flow.add('nozzle', -100, -200)!, b = flow.add('nozzle', 100, 200)!
    expect(a).not.toBe(b)
    flow.move(a, 250, 360)
    flow.move(a, Infinity, 2)
    expect(flow.nodes[0]).toMatchObject({ x: 250, y: 360 })
    flow.move(a, -20, -20)
    expect(flow.nodes[0]).toMatchObject({ x: 24, y: 24 })
  })
})
