import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import type { Page } from '@playwright/test'

/** Real Rust/Python execution with only external model providers replaced by labelled fixtures. */
export async function aiRuntimeFixture(page: Page) {
  const directory = await mkdtemp(join(tmpdir(), 'lmbox-ai-e2e-'))
  let completions = 0, submissions = 0, cancellations = 0, cancelled = false, slow = false
  const videoBytes = Buffer.from('LMBOX VIDEO PROVIDER FIXTURE - NOT A REAL VIDEO')
  const metadata = {
    FixturePrompt: { display_name: '测试提示词', category: 'Fixture', input: { required: { text: ['STRING', { default: 'Fixture video' }] } }, output: ['STRING'], output_name: ['text'] },
    FixtureCloudVideo: { display_name: '测试云端视频', category: 'Fixture', input: { required: {
      prompt: ['STRING', { default: '' }],
      model: ['COMBO', { options: ['fixture-video-v1', 'fixture-video-v2'], default: 'fixture-video-v1' }],
      format: ['COMFY_DYNAMICCOMBO_V3', { options: [
        { key: 'auto', inputs: { required: { codec: ['COMBO', { options: ['auto'], default: 'auto' }] } } },
        { key: 'mp4', inputs: { required: { codec: ['COMBO', { options: ['h264', 'av1'], default: 'h264' }] } } },
      ] }],
    } }, output: [], output_name: [], output_node: true },
  }
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url!, 'http://127.0.0.1')
      const chunks = []; for await (const chunk of req) chunks.push(chunk)
      const raw = Buffer.concat(chunks).toString(); const body = raw ? JSON.parse(raw) : null
      let data: unknown
      if (url.pathname === '/object_info') data = metadata
      else if (url.pathname === '/prompt') {
        assert.equal(body.prompt['2'].inputs.prompt[0], '1')
        assert.equal(body.prompt['2'].inputs.model, 'fixture-video-v1')
        assert.equal(body.prompt['2'].inputs.format, 'auto')
        assert.equal(body.prompt['2'].inputs['format.codec'], 'auto')
        assert.equal(body.extra_data.api_key_comfy_org, 'fixture-partner-key')
        submissions++; cancelled = false
        data = { prompt_id: 'fixture-video', node_errors: {} }
      } else if (url.pathname === '/history/fixture-video') {
        data = slow && !cancelled ? {} : { 'fixture-video': { status: { completed: !cancelled, status_str: cancelled ? 'error' : 'success', messages: cancelled ? [['execution_interrupted', {}]] : [] }, outputs: { '2': { videos: [{ filename: 'fixture-video.mp4', subfolder: '', type: 'output' }] } } } }
      } else if (url.pathname === '/api/jobs/fixture-video/cancel') { cancellations++; cancelled = true; data = { cancelled: true } }
      else if (url.pathname === '/view') { res.setHeader('Content-Type', 'video/mp4'); res.end(videoBytes); return }
      else if (url.pathname === '/v1/models') data = { data: [{ id: 'fixture-agent-model' }] }
      else if (url.pathname === '/v1/chat/completions') {
        assert.equal(body.model, 'fixture-agent-model'); completions++
        const used = body.messages.some((message: { role: string }) => message.role === 'tool')
        const message = used ? { role: 'assistant', content: 'Fixture task complete: answer.txt contains 42.' } : { role: 'assistant', content: null, tool_calls: [{ id: 'fixture-write', type: 'function', function: { name: 'write_file', arguments: JSON.stringify({ name: 'answer.txt', content: '42' }) } }] }
        data = { choices: [{ finish_reason: used ? 'stop' : 'tool_calls', message }] }
      } else { res.writeHead(404); res.end(); return }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data))
    } catch { res.writeHead(500); res.end(JSON.stringify({ error: 'Fixture assertion failed' })) }
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address() as { port: number }
  const python = resolve('.tools/ai/venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  const child = spawn(resolve('src-rust/target/debug', process.platform === 'win32' ? 'ai.exe' : 'ai'), [python, resolve('engine/src'), directory], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, LMBOX_COMFYUI_URL: `http://127.0.0.1:${address.port}`, LMBOX_COMFYUI_API_KEY: '', LMBOX_COMFY_NODE_CREDENTIALS: '{}', LMBOX_COMFY_PARTNER_API_KEY: 'fixture-partner-key', LMBOX_AGENT_BASE_URL: `http://127.0.0.1:${address.port}/v1`, LMBOX_AGENT_MODEL: 'fixture-agent-model', LMBOX_AGENT_API_KEY: '', LANGSMITH_TRACING: 'false', LANGCHAIN_TRACING_V2: 'false' } })
  let buffer = ''
  const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  child.stdin.on('error', () => {}); child.stderr.resume(); child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk; let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const value = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1)
      const key = `${value.projectId}:${value.requestId}`, waiter = pending.get(key)
      if (waiter) { clearTimeout(waiter.timer); pending.delete(key); waiter.resolve(value) }
    }
  })
  child.once('close', () => { for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error('Fixture AI process exited')) }; pending.clear() })
  await page.route('**/api/ai', async route => {
    const request = route.request().postDataJSON()
    const key = `${request.projectId}:${request.requestId}`
    try {
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(key); reject(new Error('AI fixture response timeout')) }, 15000)
        pending.set(key, { resolve, reject, timer }); child.stdin.write(`${JSON.stringify(request)}\n`)
      })
      await route.fulfill({ json: result })
    } catch { await route.fulfill({ status: 503, json: { error: 'Fixture AI transport failed' } }) }
  })
  return {
    videoBytes,
    counts: () => ({ completions, submissions, cancellations }),
    slowVideo: () => { slow = true },
    async close() {
      child.stdin.end()
      const timer = setTimeout(() => child.kill('SIGKILL'), 30000)
      await new Promise<void>(resolve => { if (child.exitCode !== null || child.signalCode !== null) resolve(); else child.once('close', () => resolve()) })
      clearTimeout(timer)
      for (const waiter of pending.values()) clearTimeout(waiter.timer)
      await new Promise<void>(resolve => server.close(() => resolve()))
      await rm(directory, { recursive: true, force: true })
    },
  }
}
