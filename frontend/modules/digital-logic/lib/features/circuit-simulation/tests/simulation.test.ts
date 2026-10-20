import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import type { LogicRequest, LogicResponse } from '../../../../../../contracts'
import { useLogicCircuit } from '../../../domain/circuit'
import { useCircuitSimulation } from '../index'

const cleanups: (() => void)[] = []
const flush = async () => { await nextTick(); for (let i = 0; i < 8; i++) await Promise.resolve() }
function setup() {
  const requests: { request: LogicRequest; resolve(value: LogicResponse): void; reject(error: Error): void }[] = []
  const sessions: { request: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[] = []
  const timers = new Map<number, () => void>()
  let timerId = 0
  const dependencies = {
    createSession() {
      const session = {
        request: vi.fn((request: LogicRequest) => new Promise<LogicResponse>((resolve, reject) => {
          requests.push({ request, resolve, reject })
        })),
        dispose: vi.fn(),
      }
      sessions.push(session)
      return session
    },
    scheduleTick(callback: () => void) {
      const id = ++timerId
      timers.set(id, callback)
      return () => { timers.delete(id) }
    },
  }
  const circuit = useLogicCircuit()
  circuit.nodes = [{ id: 'switch', gateId: 'input', x: 24, y: 24 }]
  circuit.inputValues.switch = '0'
  const simulation = useCircuitSimulation(dependencies)
  cleanups.push(simulation.dispose)
  async function resolve(index: number, overrides: Partial<LogicResponse> = {}) {
    const entry = requests[index]!
    const { command: _command, ...identity } = entry.request
    entry.resolve({ ...identity, tick: 0, outputs: { switch: '0' }, inputs: { switch: {} }, displays: {}, diagnostics: [], ...overrides })
    await flush()
  }
  return { circuit, simulation, dependencies, requests, sessions, timers, resolve }
}

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

describe('digital logic simulation coordination', () => {
  it('loads the public graph and ignores coordinate edits while reloading changed topology', async () => {
    const h = setup()
    await flush()
    expect(h.requests[0]!.request.command).toEqual({ type: 'load', nodes: [{ id: 'switch', kind: 'input' }], edges: [], values: { switch: '0' } })
    await h.resolve(0, { tick: 8 })
    h.circuit.nodes[0]!.x = 340
    h.circuit.nodes[0]!.y = 140
    await flush()
    expect(h.requests).toHaveLength(1)
    expect(h.simulation.view.value.result?.tick).toBe(8)
    h.circuit.nodes.push({ id: 'probe', gateId: 'probe', x: 500, y: 140 })
    await flush()
    expect(h.simulation.view.value.result).toBeNull()
    expect(h.sessions[0]!.dispose).toHaveBeenCalledOnce()
    expect(h.requests[1]!.request.command).toMatchObject({ type: 'load', nodes: [{ id: 'switch' }, { id: 'probe' }] })
    await h.resolve(1)
    expect(h.simulation.view.value.result?.tick).toBe(0)
  })

  it('serializes rapid input changes and never displays an older revision', async () => {
    const h = setup()
    await flush()
    void h.simulation.toggleInput('switch')
    void h.simulation.toggleInput('switch')
    await flush()
    expect(h.requests).toHaveLength(1)
    expect(h.circuit.inputValues.switch).toBe('0')
    await h.resolve(0)
    expect(h.simulation.view.value.result).toBeNull()
    expect(h.requests[1]!.request.command).toEqual({ type: 'set_input', nodeId: 'switch', value: '1' })
    await h.resolve(1, { outputs: { switch: '1' } })
    expect(h.simulation.view.value.result).toBeNull()
    expect(h.simulation.view.value.busy).toBe(true)
    expect(h.requests[2]!.request.command).toEqual({ type: 'set_input', nodeId: 'switch', value: '0' })
    await h.resolve(2)
    expect(h.simulation.view.value.result?.outputs.switch).toBe('0')
    expect(h.simulation.view.value.busy).toBe(false)
    expect(h.requests.map(entry => entry.request.inputRevision)).toEqual([1, 2, 3])
  })

  it('invalidates an outstanding step when a new graph is queued', async () => {
    const h = setup()
    await flush(); await h.resolve(0)
    void h.simulation.step()
    await flush()
    h.circuit.nodes.push({ id: 'clock', gateId: 'clock', x: 500, y: 140 })
    await flush()
    await h.resolve(1, { tick: 99 })
    expect(h.simulation.view.value.result).toBeNull()
    expect(h.requests[2]!.request.command.type).toBe('load')
    await h.resolve(2)
    expect(h.simulation.view.value.result?.tick).toBe(0)
  })

  it('rejects mismatched identity, blocks stepping, and recovers with a fresh session on reset', async () => {
    const h = setup()
    await flush()
    await h.resolve(0, { projectId: 'another-project' })
    expect(h.simulation.view.value.error).toContain('不匹配')
    expect(await h.simulation.step()).toBe(false)
    expect(h.requests).toHaveLength(1)
    h.circuit.inputValues.switch = '1'
    void h.simulation.reset()
    await flush()
    expect(h.requests[1]!.request.command).toMatchObject({ type: 'load', values: { switch: '1' } })
    expect(h.sessions[0]!.dispose).toHaveBeenCalledOnce()
    await h.resolve(1, { outputs: { switch: '1' } })
    expect(h.simulation.view.value.error).toBeNull()
    expect(h.simulation.view.value.result?.outputs.switch).toBe('1')
  })

  it('runs one pending tick at a time and cancelling run prevents later scheduling', async () => {
    const h = setup()
    await flush(); await h.resolve(0)
    h.simulation.toggleRunning()
    await flush()
    expect(h.requests[1]!.request.command).toEqual({ type: 'step', ticks: 1 })
    expect(h.timers.size).toBe(0)
    h.simulation.pause()
    await h.resolve(1, { tick: 1 })
    expect(h.timers.size).toBe(0)
    expect(h.simulation.view.value.running).toBe(false)
    h.simulation.toggleRunning()
    await flush(); await h.resolve(2, { tick: 2 })
    expect(h.timers.size).toBe(1)
    const next = [...h.timers.values()][0]!
    h.timers.clear(); next()
    await flush()
    expect(h.requests).toHaveLength(4)
    h.requests[3]!.reject(new Error('worker unavailable'))
    await flush()
    expect(h.simulation.view.value.running).toBe(false)
    expect(h.simulation.view.value.error).toBe('worker unavailable')
    expect(h.timers.size).toBe(0)
  })

  it('reuses the circuit session across view lifetimes and pauses without losing results', async () => {
    const h = setup()
    await flush(); await h.resolve(0, { tick: 4 })
    h.simulation.pause()
    expect(useCircuitSimulation(h.dependencies)).toBe(h.simulation)
    expect(h.simulation.view.value.result?.tick).toBe(4)
    expect(h.sessions).toHaveLength(1)
  })

  it('disposes pending work, ignores late responses, and creates a new controller when reopened', async () => {
    const h = setup()
    await flush()
    void h.simulation.toggleInput('switch')
    h.simulation.dispose()
    await h.resolve(0)
    expect(h.sessions[0]!.dispose).toHaveBeenCalledOnce()
    expect(h.requests).toHaveLength(1)
    expect(h.simulation.view.value.result).toBeNull()
    expect(h.simulation.view.value.busy).toBe(false)
    h.circuit.nodes.push({ id: 'clock', gateId: 'clock', x: 400, y: 100 })
    await flush()
    expect(h.requests).toHaveLength(1)
    const reopened = useCircuitSimulation(h.dependencies)
    cleanups.push(reopened.dispose)
    expect(reopened).not.toBe(h.simulation)
    await flush()
    expect(h.requests).toHaveLength(2)
  })
})
