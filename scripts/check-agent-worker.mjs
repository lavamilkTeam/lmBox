import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const source = process.argv[2] ? resolve(process.argv[2]) : join(root, 'desktop/tauri/resources/lmbox-ai')
const temporary = await mkdtemp(join(tmpdir(), 'lmbox-conecode-check-'))
const runtime = join(temporary, 'agent')
let calls = 0, child, timer
const server = createServer(async (req, res) => {
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    if (req.url === '/v1/models') { res.end(JSON.stringify({ data: [{ id: 'fixture-conecode-model' }] })); return }
    assert.equal(req.url, '/v1/chat/completions')
    const body = JSON.parse(Buffer.concat(chunks).toString())
    assert.equal(body.model, 'fixture-conecode-model')
    calls++
    const call = (name, args) => ({ role: 'assistant', content: null, tool_calls: [{ id: `fixture-${calls}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] })
    let message
    if (calls === 1) message = call('calculate', { expression: '6 * 7' })
    else if (calls === 2) { assert.equal(JSON.parse(body.messages.at(-1).content).result, 42); message = call('write_file', { name: 'answer.txt', content: '42' }) }
    else { assert.equal(JSON.parse(body.messages.at(-1).content).ok, true); message = { role: 'assistant', content: 'Fixture ConeCode result: 42.' } }
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ choices: [{ finish_reason: message.tool_calls ? 'tool_calls' : 'stop', message }] }))
  } catch { res.writeHead(500); res.end('{"error":"fixture assertion failed"}') }
})
try {
  await cp(join(source, 'agent'), runtime, { recursive: true })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const request = { schemaVersion: 1, projectId: 'fixture-conecode', inputRevision: 1, capability: 'agent' }
  child = spawn(join(root, `src-rust/target/debug/ai${process.platform === 'win32' ? '.exe' : ''}`),
    ['unused-python', 'unused-engine', join(temporary, 'jobs'), join(runtime, process.platform === 'win32' ? 'node.exe' : 'node'), join(runtime, 'dist/worker.js')],
    { cwd: temporary, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', LMBOX_AGENT_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`, LMBOX_AGENT_MODEL: 'fixture-conecode-model', LMBOX_AGENT_API_KEY: '' } })
  timer = setTimeout(() => child.kill('SIGKILL'), 60000)
  let output = '', sequence = 0
  const pending = new Map()
  child.stdin.on('error', () => {})
  child.stderr.resume(); child.stdout.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    output += chunk
    if (Buffer.byteLength(output) > 2 * 1024 * 1024) { child.kill('SIGKILL'); return }
    let newline
    while ((newline = output.indexOf('\n')) >= 0) {
      const result = JSON.parse(output.slice(0, newline)); output = output.slice(newline + 1)
      pending.get(result.requestId)?.resolve(result); pending.delete(result.requestId)
    }
  })
  const exit = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', code => { for (const waiter of pending.values()) waiter.reject(new Error('Agent CLI exited')); pending.clear(); resolve(code) })
  })
  // Attach rejection handling before the first write to avoid unhandled startup errors.
  exit.catch(() => {})
  const send = payload => new Promise((resolve, reject) => {
    const requestId = `fixture-${++sequence}`; pending.set(requestId, { resolve, reject })
    child.stdin.write(JSON.stringify({ ...request, requestId, ...payload }) + '\n')
  })
  const inspect = await send({ operation: 'inspect' })
  assert.equal(inspect.ok, true, JSON.stringify(inspect.error))
  assert.equal(inspect.data.model, 'fixture-conecode-model')
  const started = await send({ operation: 'start', payload: { prompt: 'Fixture: calculate and save 42.', maxSteps: 6, files: [] } })
  assert.equal(started.ok, true)
  const jobId = started.data.job.jobId
  let status
  do {
    await new Promise(resolve => setTimeout(resolve, 25))
    status = await send({ operation: 'status', jobId })
    assert.equal(status.ok, true)
  } while (status.data.job.status === 'running')
  assert.equal(status.data.job.status, 'succeeded', JSON.stringify(status.data.job.error))
  assert.equal(status.data.job.result.text, 'Fixture ConeCode result: 42.')
  assert.equal(calls, 3)
  const artifact = status.data.job.result.artifacts[0]
  const saved = await send({ operation: 'artifact', jobId, payload: { artifactId: artifact.id } })
  assert.equal(saved.ok, true)
  assert.equal(Buffer.from(saved.data.base64, 'base64').toString(), '42')
  child.stdin.end()
  assert.equal(await exit, 0)
  console.log('Relocated ConeCode Node worker + Rust tools: model loop, calculator and artifact download passed (local provider fixture).')
} finally {
  clearTimeout(timer); child?.kill()
  await new Promise(resolve => server.close(resolve))
  await rm(temporary, { recursive: true, force: true })
}
