import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createCloudTransport } from '../server.mjs'
import { createAgentRuntimeServer } from '../runtime.mjs'

const userId = '123e4567-e89b-42d3-a456-426614174000'
const serviceToken = 'service-token-'.repeat(4)
const runtimeToken = `${'a'.repeat(64)}.${'b'.repeat(43)}`
const body = { schemaVersion: 1, projectId: 'cloud-chat', requestId: 'inspect-1', inputRevision: 0, capability: 'agent', operation: 'inspect' }
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}` }
const close = async server => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }

test('new conversation inspect ensures the user container and subsequent work uses its runtime', async () => {
  let ensures = 0, requests = 0, stopped = false, fail = false
  const runtime = createAgentRuntimeServer({ token: runtimeToken, transport: {
    async request(request) { requests++; return { ...request, ok: true, data: { configured: true } } },
    close() { stopped = true },
  } })
  const runtimeUrl = await listen(runtime)
  const manager = createServer(async (req, res) => {
    assert.equal(req.url, '/api/containers/v1/ensure')
    assert.equal(req.headers.authorization, `Bearer ${serviceToken}`)
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), { userId })
    ensures++
    res.writeHead(fail ? 503 : 200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(fail ? { error: 'private daemon detail' } : { status: 'ready', runtimeUrl, runtimeToken }))
  })
  const managerUrl = await listen(manager)
  const transport = createCloudTransport({ ensureUrl: `${managerUrl}/api/containers/v1/ensure`, serviceToken, userId })
  try {
    const inspection = await transport.request(body)
    assert.equal(inspection.ok, true)
    assert.equal(ensures, 1); assert.equal(requests, 1)
    await transport.request({ ...body, requestId: 'start-1', operation: 'start' })
    assert.equal(ensures, 1); assert.equal(requests, 2)
    await transport.request({ ...body, requestId: 'inspect-2' })
    assert.equal(ensures, 2); assert.equal(requests, 3)

    const unauthorized = await fetch(`${runtimeUrl}/v1/agent`, { method: 'POST', headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' }, body: JSON.stringify(body) })
    assert.equal(unauthorized.status, 401)

    fail = true
    const unavailable = createCloudTransport({ ensureUrl: `${managerUrl}/api/containers/v1/ensure`, serviceToken, userId })
    await assert.rejects(unavailable.request(body), error => error.message === 'Cloud container unavailable' && !String(error).includes('private'))
    assert.equal(requests, 3)
    unavailable.close()
    assert.throws(() => createCloudTransport({ ensureUrl: managerUrl, serviceToken: '', userId }), /Invalid cloud container configuration/)
  } finally {
    transport.close(); await close(manager); await close(runtime); assert.equal(stopped, true)
  }
})
