import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LogicRequest, LogicResponse } from '../../../contracts'
import { createDigitalLogicSession } from '../index'

class LogicWorker {
  static instances: LogicWorker[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() { LogicWorker.instances.push(this) }
  reply(index: number, change: (response: LogicResponse) => unknown = value => value) {
    const envelope = this.postMessage.mock.calls[index]![0] as { id: string; json: string }
    const request: LogicRequest = JSON.parse(envelope.json)
    const response: LogicResponse = { schemaVersion: 1, projectId: request.projectId, requestId: request.requestId,
      inputRevision: request.inputRevision, tick: 0, outputs: { source: '1', probe: 'X' },
      inputs: { probe: { A: 'Z' }, lcd: { 'R/W': '0' } }, displays: { lcd: { rows: ['Hello           ', '                '], cursor: 5, displayOn: true } }, diagnostics: [] }
    this.onmessage?.(new MessageEvent('message', { data: { id: envelope.id, result: JSON.stringify(change(response)) } }))
  }
}
const request = (revision = 1): LogicRequest => ({ schemaVersion: 1, projectId: 'workspace-one', requestId: `request-${revision}`,
  inputRevision: revision, command: { type: 'load', nodes: [{ id: 'source', kind: 'input' }], edges: [], values: { source: '1' } } })
function setup() { vi.stubGlobal('Worker', LogicWorker); const session = createDigitalLogicSession(); return { session, worker: LogicWorker.instances.at(-1)! } }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); LogicWorker.instances = [] })

describe('digital logic workspace transport', () => {
  it('serializes commands on one persistent worker and snapshots queued inputs', async () => {
    const { session, worker } = setup()
    const first = session.request(request(1))
    const secondInput = request(2)
    const second = session.request(secondInput)
    secondInput.requestId = 'changed-after-queue'
    secondInput.command = { type: 'reset' }
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    worker.onmessage!(new MessageEvent('message', { data: { id: 'old-response', result: '{}' } }))
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    worker.reply(0)
    expect(worker.postMessage).toHaveBeenCalledTimes(2)
    worker.reply(1)
    expect((await first).outputs).toEqual({ source: '1', probe: 'X' })
    expect((await first).inputs.lcd).toEqual({ 'R/W': '0' })
    expect((await second).requestId).toBe('request-2')
    expect(JSON.parse(worker.postMessage.mock.calls[1]![0].json).command.type).toBe('load')
    expect(LogicWorker.instances).toHaveLength(1)
    session.dispose()
  })

  it('rejects all pending commands on dispose and ignores a late response', async () => {
    const { session, worker } = setup()
    const first = expect(session.request(request(1))).rejects.toThrow('已关闭')
    const second = expect(session.request(request(2))).rejects.toThrow('已关闭')
    const late = worker.onmessage!
    session.dispose(); session.dispose()
    late(new MessageEvent('message', { data: { id: '1', result: '{}' } }))
    await Promise.all([first, second])
    await expect(session.request(request(3))).rejects.toThrow('已关闭')
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
  })

  it('terminates an unresponsive worker, rejects queued work, and cannot resurrect it', async () => {
    vi.useFakeTimers()
    const { session, worker } = setup()
    const pending = [expect(session.request(request(1))).rejects.toThrow('超时'), expect(session.request(request(2))).rejects.toThrow('超时')]
    await vi.advanceTimersByTimeAsync(30000)
    await Promise.all(pending)
    expect(worker.terminate).toHaveBeenCalledOnce()
    await expect(session.request(request(3))).rejects.toThrow('超时')
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
  })

  it.each(['onerror', 'onmessageerror'] as const)('rejects pending work when the worker emits %s', async event => {
    const { session, worker } = setup()
    const failed = expect(session.request(request())).rejects.toThrow('数字逻辑')
    worker[event]!()
    await failed
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('keeps sessions isolated and continues after an atomic core command rejection', async () => {
    const first = setup(); const second = setup()
    const rejected = expect(first.session.request(request(1))).rejects.toThrow('节点不存在')
    const following = first.session.request(request(2))
    const independent = second.session.request({ ...request(1), projectId: 'workspace-two' })
    first.worker.onmessage!(new MessageEvent('message', { data: { id: '1', error: '节点不存在' } }))
    first.worker.reply(1); second.worker.reply(0)
    await rejected
    expect((await following).inputRevision).toBe(2)
    expect((await independent).projectId).toBe('workspace-two')
    expect(first.worker.terminate).not.toHaveBeenCalled()
    first.session.dispose(); second.session.dispose()
  })

  it.each([
    (value: LogicResponse) => ({ ...value, inputRevision: 0 }),
    (value: LogicResponse) => ({ ...value, tick: Number.MAX_SAFE_INTEGER + 1 }),
    (value: LogicResponse) => ({ ...value, outputs: { source: 'true' } }),
    (value: LogicResponse) => ({ ...value, inputs: { probe: { in: null } } }),
    (value: LogicResponse) => ({ ...value, displays: { lcd: { rows: ['too short', '                '], cursor: 0, displayOn: true } } }),
    (value: LogicResponse) => ({ ...value, diagnostics: [{ nodeId: 'bad.id', message: 'error' }] }),
    (value: LogicResponse) => ({ ...value, outputs: Object.fromEntries(Array.from({ length: 513 }, (_, n) => [`node-${n}`, '0'])) }),
    (value: LogicResponse) => ({ ...value, unexpected: true }),
  ])('rejects malformed or mismatched results and terminates the corrupted session %#', async change => {
    const { session, worker } = setup()
    const failed = expect(session.request(request())).rejects.toThrow('数字逻辑')
    worker.reply(0, change)
    await failed
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('bounds queued work without interrupting accepted requests', async () => {
    const { session, worker } = setup()
    const pending = Array.from({ length: 32 }, (_, n) => expect(session.request(request(n))).rejects.toThrow('已关闭'))
    await expect(session.request(request(32))).rejects.toThrow('请求过多')
    expect(worker.postMessage).toHaveBeenCalledOnce()
    expect(worker.terminate).not.toHaveBeenCalled()
    session.dispose()
    await Promise.all(pending)
  })

  it('rejects invalid inputs before sending them into WASM', async () => {
    const { session, worker } = setup()
    await expect(session.request({ ...request(), command: { type: 'step', ticks: 0 } })).rejects.toThrow('限制')
    await expect(session.request({ ...request(), inputRevision: Infinity })).rejects.toThrow('限制')
    await expect(session.request({ ...request(), projectId: '../other' })).rejects.toThrow('限制')
    expect(worker.postMessage).not.toHaveBeenCalled()
    session.dispose()
  })
})
