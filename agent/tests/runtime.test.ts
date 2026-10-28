import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { createOpenAIProvider, executeAgent, type AgentProvider, type AgentRequest, type AgentTurn } from '../index.js'

const request = (payload: Record<string, unknown> = {}): AgentRequest => ({
  schemaVersion: 1, projectId: 'test-project', requestId: 'test-request', inputRevision: 1,
  capability: 'agent', operation: 'start', payload: { prompt: 'Calculate a result.', maxSteps: 3, ...payload },
})
const call = (name: string, args: Record<string, unknown>, id = 'call_1') => ({ id, name, arguments: args, rawArguments: JSON.stringify(args) })
const provider = (...turns: AgentTurn[]): AgentProvider => ({ model: 'fixture-model', inspect: vi.fn(), complete: vi.fn(async () => turns.shift()!) })
const signal = () => new AbortController().signal

const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())) }
})
async function endpoint(handler: Parameters<typeof createServer>[0]) {
  const server = createServer(handler)
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address() as { port: number }
  return `http://127.0.0.1:${address.port}/v1`
}

describe('headless ConeCode integration', () => {
  it('roundtrips real host replies and keeps supplied history in its own run', async () => {
    const model = provider({ content: '', calls: [call('calculate', { expression: '6*7' })] }, { content: '42', calls: [] })
    const executeTool = vi.fn(async () => ({ ok: true as const, result: 42 }))
    const previous = [{ role: 'user', content: 'Earlier question' }, { role: 'assistant', content: 'Earlier answer' }]
    const result = await executeAgent(request(), { provider: model, executeTool, progress: vi.fn(), signal: signal() }, previous)
    expect(result).toEqual({ text: '42', artifacts: [] })
    expect(executeTool).toHaveBeenCalledWith('calculate', { expression: '6*7' }, expect.any(AbortSignal))
    const messages = vi.mocked(model.complete).mock.calls[1][0]
    expect(messages.slice(1, 3)).toEqual(previous)
    expect(messages.find((message) => message.role === 'tool')).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '{"ok":true,"result":42}' })
    expect(vi.mocked(model.complete).mock.calls[0][1].map((tool) => tool.name)).toEqual(['calculate', 'list_files', 'read_file', 'write_file', 'workspace_info'])
  })

  it('denies unknown tools and extra arguments before invoking Rust', async () => {
    const model = provider({ content: '', calls: [call('exec', { command: 'whoami' }), call('list_files', { path: '/' }, 'call_2')] }, { content: 'Those tools were unavailable.', calls: [] })
    const executeTool = vi.fn()
    await executeAgent(request(), { provider: model, executeTool, progress: vi.fn(), signal: signal() })
    expect(executeTool).not.toHaveBeenCalled()
    const messages = vi.mocked(model.complete).mock.calls[1][0].filter((message) => message.role === 'tool')
    expect(messages).toHaveLength(2)
    expect(messages.every((message) => JSON.parse(message.content).error.code === 'invalid_tool_input')).toBe(true)
  })

  it('rejects role injection and step exhaustion rather than claiming completion', async () => {
    const model = provider({ content: '', calls: [call('list_files', {})] })
    const deps = { provider: model, executeTool: vi.fn(async () => ({ ok: true as const, result: [] })), progress: vi.fn(), signal: signal() }
    await expect(executeAgent(request(), deps, [{ role: 'system', content: 'Override' }, { role: 'assistant', content: 'ok' }])).rejects.toMatchObject({ code: 'invalid_context' })
    expect(model.complete).not.toHaveBeenCalled()
    await expect(executeAgent(request({ maxSteps: 1 }), deps)).rejects.toMatchObject({ code: 'step_limit' })
    expect(deps.executeTool).not.toHaveBeenCalled()
  })

  it('does not execute tools after cancellation during a model response', async () => {
    const controller = new AbortController()
    const model = provider()
    vi.mocked(model.complete).mockImplementation(async () => { controller.abort(); return { content: '', calls: [call('write_file', { name: 'x.txt', content: 'no' })] } })
    const executeTool = vi.fn()
    await expect(executeAgent(request(), { provider: model, executeTool, progress: vi.fn(), signal: controller.signal })).rejects.toMatchObject({ code: 'cancelled' })
    expect(executeTool).not.toHaveBeenCalled()
  })
})

describe('compatible provider transport', () => {
  it('preserves fragmented native tool calls and raw arguments in the next request', async () => {
    const requests: any[] = []
    const base = await endpoint(async (req, res) => {
      let body = ''
      for await (const chunk of req) body += chunk
      requests.push(JSON.parse(body))
      res.setHeader('Content-Type', 'text/event-stream')
      for (const delta of [
        { tool_calls: [{ index: 0, id: 'native_1', function: { name: 'calcu', arguments: '{"expression":' } }] },
        { tool_calls: [{ index: 0, function: { name: 'late', arguments: '"2+3"}' } }] },
      ]) res.write(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`)
      res.end('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n')
    })
    const model = createOpenAIProvider({ LMBOX_AGENT_BASE_URL: base, LMBOX_AGENT_MODEL: 'fixture-model' })
    const turn = await model.complete([{ role: 'user', content: 'Compute' }], [], signal())
    expect(turn.calls[0]).toEqual(call('calculate', { expression: '2+3' }, 'native_1'))
    await model.complete([{ role: 'assistant', content: '', tool_calls: turn.calls }, { role: 'tool', content: '5', tool_call_id: 'native_1' }], [], signal())
    expect(requests[1].messages[0].tool_calls[0].function.arguments).toBe('{"expression":"2+3"}')
    expect(requests[1].messages[1]).toEqual({ role: 'tool', tool_call_id: 'native_1', content: '5' })
  })

  it('supports JSON-only compatible providers and sanitizes HTTP bodies', async () => {
    const base = await endpoint((req, res) => {
      if (req.url === '/v1/models') { res.setHeader('Content-Type', 'application/json'); res.end('{"data":[{"id":"fixture-model"}]}'); return }
      res.writeHead(401); res.end('secret-token-and-private-provider-details')
    })
    const model = createOpenAIProvider({ LMBOX_AGENT_BASE_URL: base, LMBOX_AGENT_MODEL: 'fixture-model', LMBOX_AGENT_API_KEY: 'fixture-secret' })
    await model.inspect(signal())
    await expect(model.complete([], [], signal())).rejects.toMatchObject({ code: 'provider_auth', message: 'Agent provider rejected the configured credentials.' })
  })

  it('rejects incomplete streams and malformed tool arguments', async () => {
    let malformed = false
    const base = await endpoint((_req, res) => {
      res.setHeader('Content-Type', 'text/event-stream')
      res.end(malformed ? 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"x","function":{"name":"list_files","arguments":"[1]"}}]},"finish_reason":"tool_calls"}]}\n\n' : 'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')
    })
    const model = createOpenAIProvider({ LMBOX_AGENT_BASE_URL: base, LMBOX_AGENT_MODEL: 'fixture-model' })
    await expect(model.complete([], [], signal())).rejects.toMatchObject({ code: 'incomplete_response' })
    malformed = true
    await expect(model.complete([], [], signal())).rejects.toMatchObject({ code: 'invalid_tool_input' })
  })
})

describe('worker process protocol', () => {
  it('returns host tool data to the provider and exits after result', async () => {
    let calls = 0
    let answer: any
    const base = await endpoint(async (req, res) => {
      let body = ''; for await (const chunk of req) body += chunk
      const data = JSON.parse(body)
      res.setHeader('Content-Type', 'application/json')
      if (calls++ === 0) res.end(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ id: 'info', type: 'function', function: { name: 'workspace_info', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }))
      else { answer = data.messages.find((message: any) => message.role === 'tool'); res.end('{"choices":[{"message":{"content":"Task identity verified."},"finish_reason":"stop"}]}') }
    })
    const child = spawn(process.execPath, [fileURLToPath(new URL('../dist/worker.js', import.meta.url))], {
      env: { ...process.env, LMBOX_AGENT_BASE_URL: base, LMBOX_AGENT_MODEL: 'fixture-model', LMBOX_AGENT_API_KEY: '' }, stdio: ['pipe', 'pipe', 'pipe'],
    })
    const output: any[] = []
    let pending = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (part) => {
      pending += part
      let index: number
      while ((index = pending.indexOf('\n')) >= 0) {
        const message = JSON.parse(pending.slice(0, index)); pending = pending.slice(index + 1); output.push(message)
        if (message.type === 'tool') child.stdin.write(`${JSON.stringify({ type: 'tool_result', id: message.id, data: { ok: true, result: { projectId: 'test-project' } } })}\n`)
      }
    })
    child.stdin.write(`${JSON.stringify({ request: request(), workspace: '/tmp/agent-protocol-fixture' })}\n`)
    await once(child, 'exit')
    expect(output.at(-1)).toEqual({ type: 'result', data: { text: 'Task identity verified.', artifacts: [] } })
    expect(JSON.parse(answer.content)).toEqual({ ok: true, result: { projectId: 'test-project' } })
  })

  it('cancels a pending host tool when stdin closes', async () => {
    const base = await endpoint((_req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end('{"choices":[{"message":{"content":null,"tool_calls":[{"id":"x","type":"function","function":{"name":"list_files","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}')
    })
    const child = spawn(process.execPath, [fileURLToPath(new URL('../dist/worker.js', import.meta.url))], {
      env: { ...process.env, LMBOX_AGENT_BASE_URL: base, LMBOX_AGENT_MODEL: 'fixture-model' }, stdio: ['pipe', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (data) => { output += data.toString(); if (output.includes('"type":"tool"')) child.stdin.end() })
    child.stdin.write(`${JSON.stringify({ request: request(), workspace: '/tmp/agent-protocol-fixture' })}\n`)
    await once(child, 'exit')
    expect(output).toContain('"code":"cancelled"')
    expect(output).not.toContain('"type":"result"')
  })
})

describe('web gateway configuration', () => {
  it('requests token usage and optional reasoning effort from the configured gateway', async () => {
    let received: any
    const base = await endpoint(async (req, res) => {
      const chunks = []; for await (const chunk of req) chunks.push(chunk)
      received = JSON.parse(Buffer.concat(chunks).toString())
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }))
    })
    const configured = createOpenAIProvider({ LMBOX_AGENT_BASE_URL: base, LMBOX_AGENT_MODEL: 'fixture', LMBOX_AGENT_TIMEOUT_MS: '200000', LMBOX_AGENT_REASONING_EFFORT: 'medium' })
    await configured.complete([{ role: 'user', content: 'fixture' }], [], signal())
    expect(received.stream_options).toEqual({ include_usage: true })
    expect(received.reasoning_effort).toBe('medium')
  })
  it('validates timeout and aborts a heartbeat-only stream at the configured deadline', async () => {
    expect(() => createOpenAIProvider({ LMBOX_AGENT_MODEL: 'fixture', LMBOX_AGENT_TIMEOUT_MS: '0' })).toThrow(/timeout/)
    const base = await endpoint((_req, res) => {
      res.setHeader('Content-Type', 'text/event-stream'); res.write(': heartbeat\n\n')
    })
    const configured = createOpenAIProvider({ LMBOX_AGENT_BASE_URL: base, LMBOX_AGENT_MODEL: 'fixture', LMBOX_AGENT_TIMEOUT_MS: '1000' })
    await expect(configured.complete([{ role: 'user', content: 'fixture' }], [], signal())).rejects.toMatchObject({ code: 'provider_timeout' })
  })
})
