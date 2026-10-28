import { createServer } from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'

const root = resolve('dist-web-agent')
await access(join(root, 'server/server.mjs'))
const directory = await mkdtemp(join(tmpdir(), 'agent-package-check-'))
let calls = 0, toolReply = false
const model = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  if (req.url === '/v1/models') { res.end(JSON.stringify({ data: [{ id: 'package-fixture' }] })); return }
  const chunks = []; for await (const chunk of req) chunks.push(chunk)
  const body = JSON.parse(Buffer.concat(chunks).toString())
  calls++
  const tool = body.messages.find(message => message.role === 'tool')
  if (tool) { assert.equal(tool.tool_call_id, 'fixture-write'); assert.equal(JSON.parse(tool.content).ok, true); toolReply = true }
  const message = tool ? { role: 'assistant', content: 'Package fixture completed' }
    : { role: 'assistant', content: null, tool_calls: [{ id: 'fixture-write', type: 'function', function: { name: 'write_file', arguments: JSON.stringify({ name: 'fixture.txt', content: 'real Rust tool result' }) } }] }
  res.end(JSON.stringify({ choices: [{ message, finish_reason: tool ? 'stop' : 'tool_calls' }], usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } }))
})
model.listen(0, '127.0.0.1'); await once(model, 'listening')
const port = 3129, origin = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, [join(root, 'server/server.mjs')], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'], env: {
  ...process.env, HOST: '127.0.0.1', PORT: String(port), LMBOX_WEB_ORIGIN: origin,
  LMBOX_WEB_USERNAME: 'fixture', LMBOX_WEB_PASSWORD: 'fixture-password-only', LMBOX_WEB_DATA: directory,
  LMBOX_AGENT_BASE_URL: `http://127.0.0.1:${model.address().port}/v1`, LMBOX_AGENT_MODEL: 'package-fixture', LMBOX_AGENT_API_KEY: 'fixture-key',
} })
child.stderr.resume()
const headers = { authorization: 'Basic ' + Buffer.from('fixture:fixture-password-only').toString('base64'), origin, 'content-type': 'application/json' }
const initial = { schemaVersion: 1, projectId: 'package-fixture', requestId: 'start-fixture', inputRevision: 1, capability: 'agent', operation: 'start', payload: { prompt: 'Fixture: write an artifact', maxSteps: 3, files: [] } }
async function request(body) { const response = await fetch(origin + '/api/ai', { method: 'POST', headers, body: JSON.stringify(body) }); assert.equal(response.status, 200); const data = await response.json(); assert.equal(data.ok, true, JSON.stringify(data.error)); return data.data }
try {
  for (let i = 0; i < 100; i++) { try { const response = await fetch(origin, { headers }); if (response.ok) break } catch {} if (i === 99) throw new Error('Package failed to start'); await new Promise(resolve => setTimeout(resolve, 50)) }
  const inspection = await request({ ...initial, operation: 'inspect', requestId: 'inspect-fixture', payload: {} }); assert.equal(inspection.configured, true)
  let job = (await request(initial)).job
  for (let i = 0; i < 100 && job.status === 'running'; i++) { await new Promise(resolve => setTimeout(resolve, 50)); job = (await request({ ...initial, requestId: `status-${i}`, operation: 'status', jobId: job.jobId, payload: {} })).job }
  assert.equal(job.status, 'succeeded', JSON.stringify(job)); assert.equal(calls, 2); assert.equal(toolReply, true)
  assert.equal(job.result.text, 'Package fixture completed'); assert.equal(job.result.artifacts.length, 1)
  console.log('Packaged HTTP → Rust → Node → model fixture → Rust tool → artifact passed')
} finally {
  const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited
  model.closeAllConnections(); await new Promise(resolve => model.close(resolve)); await rm(directory, { recursive: true, force: true })
}
