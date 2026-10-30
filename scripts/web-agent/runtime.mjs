import { createServer } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createTransport } from './lib/transport.mjs'

const hash = value => createHash('sha256').update(value).digest()
const valid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)

export function createAgentRuntimeServer({ token, transport }) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}\.[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Configure a runtime token')
  const credential = hash(`Bearer ${token}`)
  const server = createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
    try {
      const pathname = new URL(req.url || '/', 'http://runtime.internal').pathname
      if (pathname === '/health' && req.method === 'GET') return send(200, { status: 'ok' })
      if (pathname !== '/v1/agent') return send(404, { error: 'Not found' })
      if (req.method !== 'POST') return send(405, { error: 'POST required' })
      if (!timingSafeEqual(hash(req.headers.authorization || ''), credential)) return send(401, { error: 'Authentication required' })
      if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'JSON required' })
      const chunks = []; let size = 0
      for await (const chunk of req) { size += chunk.length; if (size > 4 * 1024 * 1024) return send(413, { error: 'Request too large' }); chunks.push(chunk) }
      let body
      try { body = JSON.parse(Buffer.concat(chunks).toString()) } catch { return send(400, { error: 'Invalid JSON' }) }
      if (!body || body.capability !== 'agent' || !['projectId', 'requestId'].every(key => valid(body[key]))) return send(400, { error: 'Invalid Agent request' })
      try { return send(200, await transport.request(body)) } catch { return send(503, { error: 'Agent service unavailable' }) }
    } catch { if (!res.headersSent) send(500, { error: 'Request failed' }); else res.end() }
  })
  server.on('close', () => transport.close())
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const transport = createTransport({ binary: resolve(root, `bin/ai${process.platform === 'win32' ? '.exe' : ''}`), worker: resolve(root, 'agent/dist/worker.js'), directory: resolve(process.env.LMBOX_WEB_DATA || resolve(root, 'data')) })
  const server = createAgentRuntimeServer({ token: process.env.LMBOX_RUNTIME_TOKEN, transport })
  server.listen(Number(process.env.PORT || 3102), process.env.HOST || '127.0.0.1')
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { transport.close(); server.close(); server.closeAllConnections() })
}
