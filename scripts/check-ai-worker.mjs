import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const temporary = await mkdtemp(join(tmpdir(), 'lmbox-ai-worker-'))
const source = process.argv[2] ? resolve(process.argv[2]) : join(root, 'desktop/tauri/resources/lmbox-ai')
const relocated = join(temporary, 'runtime')
let calls = 0
// An explicit local provider fixture exercises the real bundled LangGraph and tools.
const server = createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk)
  if (req.url === '/v1/models') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'lmbox-fixture-model' }] })); return }
  if (req.url !== '/v1/chat/completions') { res.writeHead(404); res.end(); return }
  const body = JSON.parse(Buffer.concat(chunks).toString())
  assert.equal(body.model, 'lmbox-fixture-model')
  calls++
  const call = (name, args) => ({ role: 'assistant', content: null, tool_calls: [{ id: `fixture-${calls}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] })
  let message
  if (calls === 1) message = call('calculate', { expression: '6 * 7' })
  else if (calls === 2) {
    assert.equal(JSON.parse(body.messages.at(-1).content).result, 42)
    message = call('write_file', { name: 'answer.txt', content: '42' })
  } else {
    assert.equal(JSON.parse(body.messages.at(-1).content).ok, true)
    message = { role: 'assistant', content: 'Fixture task complete: 42.' }
  }
  res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ finish_reason: message.tool_calls ? 'tool_calls' : 'stop', message }] }))
})
try {
  await cp(source, relocated, { recursive: true })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  const worker = join(relocated, process.platform === 'win32' ? 'lmbox-ai.exe' : 'lmbox-ai')
  const request = { schemaVersion: 1, projectId: 'fixture-project', requestId: 'fixture-request', inputRevision: 1, capability: 'agent', operation: 'start', payload: { prompt: 'Fixture: calculate six times seven and write answer.txt.', maxSteps: 6, files: [] } }
  const child = spawn(worker, [], { cwd: temporary, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONPATH: '', PYTHONHOME: '', LMBOX_AGENT_BASE_URL: `http://127.0.0.1:${address.port}/v1`, LMBOX_AGENT_MODEL: 'lmbox-fixture-model', LMBOX_AGENT_API_KEY: '', LANGSMITH_TRACING: 'false', LANGCHAIN_TRACING_V2: 'false' } })
  let output = '', error = ''
  child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { output += chunk; if (output.length > 1024 * 1024) child.kill() })
  child.stderr.setEncoding('utf8'); child.stderr.on('data', chunk => { error = (error + chunk).slice(-4096) })
  child.stdin.on('error', () => {})
  const timer = setTimeout(() => child.kill('SIGKILL'), 60000)
  child.stdin.write(`${JSON.stringify({ request, workspace: temporary })}\n`)
  const status = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) })
  clearTimeout(timer)
  assert.equal(status, 0, `Relocated AI worker failed: ${error}`)
  const events = output.trim().split('\n').map(line => JSON.parse(line))
  const final = events.at(-1)
  assert.equal(final.type, 'result', JSON.stringify(final))
  assert.equal(calls, 3)
  assert.equal(final.data.text, 'Fixture task complete: 42.')
  assert.equal(final.data.artifacts.length, 1)
  const artifact = final.data.artifacts[0]
  assert.equal(artifact.name, 'answer.txt')
  assert.equal(await readFile(join(temporary, 'artifacts', artifact.id), 'utf8'), '42')
  console.log('Relocated AI worker: real LangGraph, calculator and artifact creation passed with a local provider fixture.')
} finally {
  await new Promise(resolve => server.close(resolve))
  await rm(temporary, { recursive: true, force: true })
}
