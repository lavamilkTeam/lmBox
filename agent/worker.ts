// One task per process. Rust supplies identities, files and tool results.
import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { executeAgent, createOpenAIProvider, AgentError } from './index.js'
import { safeError } from './lib/errors.js'
import type { AgentRequest, ToolReply } from './index.js'

const controller = new AbortController()
const pending = new Map<string, { resolve(value: ToolReply): void; reject(error: unknown): void; timer: ReturnType<typeof setTimeout> }>()
let buffer = Buffer.alloc(0)
let started = false
let finished = false

function emit(value: unknown): void {
  if (!finished) process.stdout.write(`${JSON.stringify(value)}\n`)
}
function close(): void {
  finished = true
  controller.abort()
  for (const call of pending.values()) {
    clearTimeout(call.timer)
    call.reject(new AgentError('cancelled', 'Agent job cancelled.'))
  }
  pending.clear()
  process.stdin.destroy()
}
function fail(error: unknown): void {
  emit({ type: 'error', ...safeError(error) })
  close()
}

async function start(envelope: any): Promise<void> {
  if (!envelope || typeof envelope !== 'object' || typeof envelope.workspace !== 'string' || !isAbsolute(envelope.workspace)) {
    throw new AgentError('invalid_request', 'A host-owned absolute workspace is required.')
  }
  const provider = createOpenAIProvider()
  const data = await executeAgent(envelope.request as AgentRequest, {
    provider, signal: controller.signal,
    progress: (message) => emit({ type: 'progress', message }),
    executeTool(name, args, signal) {
      if (signal.aborted) return Promise.reject(new AgentError('cancelled', 'Agent job cancelled.'))
      const id = randomUUID()
      return new Promise<ToolReply>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new AgentError('tool_timeout', 'The host tool did not respond in time.'))
        }, 30_000)
        pending.set(id, { resolve, reject, timer })
        emit({ type: 'tool', id, name, arguments: args })
      })
    },
  }, envelope.context)
  emit({ type: 'result', data })
  close()
}

function cancel(): void {
  controller.abort()
  for (const call of pending.values()) {
    clearTimeout(call.timer)
    call.reject(new AgentError('cancelled', 'Agent job cancelled.'))
  }
  pending.clear()
}

function receive(message: any): void {
  if (!started) {
    started = true
    void start(message).catch(fail)
    return
  }
  if (message?.type === 'cancel') { cancel(); return }
  if (message?.type !== 'tool_result' || typeof message.id !== 'string' || !pending.has(message.id)) {
    throw new AgentError('invalid_protocol', 'Invalid host tool response.')
  }
  const reply = message.data
  if (!reply || typeof reply !== 'object'
    || !(reply.ok === true && 'result' in reply || reply.ok === false && typeof reply.error?.code === 'string' && typeof reply.error?.message === 'string')) {
    throw new AgentError('invalid_protocol', 'Invalid host tool response.')
  }
  const call = pending.get(message.id)!
  pending.delete(message.id)
  clearTimeout(call.timer)
  call.resolve(reply as ToolReply)
}

process.stdin.on('data', (chunk: Buffer) => {
  if (finished) return
  try {
    buffer = Buffer.concat([buffer, chunk])
    let newline: number
    while ((newline = buffer.indexOf(10)) !== -1) {
      const line = buffer.subarray(0, newline)
      buffer = buffer.subarray(newline + 1)
      if (line.length > 5 * 1024 * 1024) throw new AgentError('invalid_request', 'Agent protocol frame exceeds the size limit.')
      let message: unknown
      try { message = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)) } catch { throw new AgentError('invalid_protocol', 'Invalid agent protocol JSON.') }
      receive(message)
      if (finished) return
    }
    if (buffer.length > 5 * 1024 * 1024) throw new AgentError('invalid_request', 'Agent protocol frame exceeds the size limit.')
  } catch (error) { fail(error) }
})
process.stdin.on('end', () => {
  if (!started && !finished) fail(new AgentError('invalid_request', 'Missing agent request.'))
  else cancel()
})
process.stdin.on('error', () => fail(new AgentError('invalid_protocol', 'Agent host input failed.')))
process.stdout.on('error', close)
