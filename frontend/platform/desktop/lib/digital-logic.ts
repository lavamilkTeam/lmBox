import type { LogicRequest, LogicResponse } from '../../../contracts'
import { readResponse, record, validateRequest } from './digital-logic-validation'

export interface DigitalLogicSession {
  request(request: LogicRequest): Promise<LogicResponse>
  dispose(): void
}
interface Pending {
  id: string
  json: string
  identity: Pick<LogicRequest, 'projectId' | 'requestId' | 'inputRevision'>
  resolve(value: LogicResponse): void
  reject(error: Error): void
}
const maxBytes = 1024 * 1024

/** Worker ownership stays with the workspace; only Rust advances simulation state. */
export function createDigitalLogicSession(): DigitalLogicSession {
  const worker = new Worker(new URL('./digital-logic.worker.ts', import.meta.url), { type: 'module' })
  const queue: Pending[] = []
  let active: Pending | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped: Error | undefined
  let sequence = 0

  function stop(error: Error) {
    if (stopped) return
    stopped = error
    clearTimeout(timer)
    worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null
    worker.terminate()
    active?.reject(error); active = undefined
    for (const pending of queue.splice(0)) pending.reject(error)
  }
  function sendNext() {
    if (stopped || active || !queue.length) return
    active = queue.shift()!
    timer = setTimeout(() => stop(new Error('数字逻辑计算超时，请复位后重试。')), 30000)
    try { worker.postMessage({ id: active.id, json: active.json }) }
    catch { stop(new Error('无法向数字逻辑计算进程发送请求。')) }
  }
  function complete(error?: Error, response?: LogicResponse) {
    const pending = active
    active = undefined; clearTimeout(timer)
    if (error) pending?.reject(error)
    else if (response) pending?.resolve(response)
    sendNext()
  }
  worker.onerror = () => stop(new Error('数字逻辑计算进程加载或运行失败，请复位后重试。'))
  worker.onmessageerror = () => stop(new Error('无法读取数字逻辑计算进程的响应。'))
  worker.onmessage = (event: MessageEvent<unknown>) => {
    if (stopped) return
    const data = event.data
    if (!record(data) || typeof data.id !== 'string') return stop(new Error('数字逻辑计算进程返回了无效响应。'))
    if (!active || data.id !== active.id) return
    if (Object.keys(data).some(key => !['id', 'result', 'error'].includes(key))
      || Object.hasOwn(data, 'result') === Object.hasOwn(data, 'error')) return stop(new Error('数字逻辑计算进程返回了无效响应。'))
    if (Object.hasOwn(data, 'error')) {
      if (typeof data.error !== 'string' || !data.error.length || data.error.length > 4096) return stop(new Error('数字逻辑计算进程返回了无效错误。'))
      return complete(new Error(data.error))
    }
    try {
      if (typeof data.result !== 'string' || new TextEncoder().encode(data.result).byteLength > 4 * maxBytes) throw new Error('数字逻辑结果超过大小限制。')
      complete(undefined, readResponse(JSON.parse(data.result), active.identity))
    } catch (error) {
      stop(error instanceof Error ? error : new Error('数字逻辑结果格式无效。'))
    }
  }
  return {
    request(request) {
      if (stopped) return Promise.reject(stopped)
      if (queue.length + Number(Boolean(active)) >= 32) return Promise.reject(new Error('数字逻辑请求过多，请等待当前计算完成。'))
      let json: string
      try {
        validateRequest(request)
        json = JSON.stringify(request)
        if (new TextEncoder().encode(json).byteLength > maxBytes) throw new Error('数字逻辑请求超过大小限制。')
      } catch (error) { return Promise.reject(error) }
      return new Promise((resolve, reject) => {
        queue.push({ id: String(++sequence), json,
          identity: { projectId: request.projectId, requestId: request.requestId, inputRevision: request.inputRevision }, resolve, reject })
        sendNext()
      })
    },
    dispose() { stop(new Error('数字逻辑工作区已关闭。')) },
  }
}
