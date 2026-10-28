import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWebAgentServer } from '../server.mjs'

test('Agent web server authenticates, enforces origin/capability, and serves the task API', async () => {
  const site = await mkdtemp(join(tmpdir(), 'agent-web-'))
  await writeFile(join(site, 'index.html'), '<title>Agent fixture</title>')
  let calls = 0, stopped = false
  const server = createWebAgentServer({ origin: 'http://127.0.0.1:3119', username: 'test', password: 'fixture-password-only', site,
    transport: { request: async r => { calls++; return { requestId: r.requestId, ok: true } }, close: () => { stopped = true } } })
  await new Promise(resolve => server.listen(3119, '127.0.0.1', resolve))
  const auth = 'Basic ' + Buffer.from('test:fixture-password-only').toString('base64')
  const request = (body, extra = {}) => fetch('http://127.0.0.1:3119/api/ai', { method: 'POST', headers: { authorization: auth, origin: 'http://127.0.0.1:3119', 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) })
  const body = { capability: 'agent', projectId: 'test', requestId: 'request' }
  try {
    assert.equal((await fetch('http://127.0.0.1:3119/')).status, 401)
    assert.match(await (await fetch('http://127.0.0.1:3119/', { headers: { authorization: auth } })).text(), /Agent fixture/)
    assert.equal((await request(body, { origin: 'http://other.test' })).status, 403)
    assert.equal((await request({ ...body, capability: 'video' })).status, 400)
    assert.equal((await request(body, { authorization: '' })).status, 401)
    assert.equal((await request(body)).status, 200); assert.equal(calls, 1)
  } finally { await new Promise(resolve => server.close(resolve)); await rm(site, { recursive: true }); assert.equal(stopped, true) }
})
