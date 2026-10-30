import { createServer } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createTransport } from './lib/transport.mjs'
import { createCloudTransport } from './lib/cloud-transport.mjs'
export { createCloudTransport } from './lib/cloud-transport.mjs'

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain', '.json': 'application/json' }
const hash = value => createHash('sha256').update(value).digest()
export function createWebAgentServer({ origin, username, password, site, transport }) {
  if (!username || username.includes(':') || !password || password.length < 16) throw new Error('Configure a web username and password of at least 16 characters')
  const allowed = new URL(origin)
  const credential = hash('Basic ' + Buffer.from(`${username}:${password}`).toString('base64'))
  const server = createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
    try {
      if (!timingSafeEqual(hash(req.headers.authorization || ''), credential)) { res.setHeader('WWW-Authenticate', 'Basic realm="lmBox", charset="UTF-8"'); return send(401, { error: 'Authentication required' }) }
      if (req.headers.host !== allowed.host || req.headers['sec-fetch-site'] === 'cross-site' || req.headers.origin && req.headers.origin !== allowed.origin) return send(403, { error: 'Invalid origin' })
      const pathname = new URL(req.url, allowed).pathname
      if (pathname === '/api/ai') {
        if (req.method !== 'POST') return send(405, { error: 'POST required' })
        if (req.headers.origin !== allowed.origin) return send(403, { error: 'Origin required' })
        if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'JSON required' })
        const chunks = []; let size = 0
        for await (const chunk of req) { size += chunk.length; if (size > 4 * 1024 * 1024) return send(413, { error: 'Request too large' }); chunks.push(chunk) }
        let body
        try { body = JSON.parse(Buffer.concat(chunks).toString()) } catch { return send(400, { error: 'Invalid JSON' }) }
        if (!body || body.capability !== 'agent' || !['projectId', 'requestId'].every(key => typeof body[key] === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(body[key]))) return send(400, { error: 'Invalid Agent request' })
        try { return send(200, await transport.request(body)) } catch { return send(503, { error: 'Agent service unavailable; query existing task before resubmitting' }) }
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, { error: 'GET required' })
      const root = await realpath(site)
      let file
      try { file = await realpath(resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname))) } catch { return send(404, { error: 'Not found' }) }
      if (!file.startsWith(root + sep)) return send(404, { error: 'Not found' })
      const data = await readFile(file)
      res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      res.end(req.method === 'HEAD' ? undefined : data)
    } catch { if (!res.headersSent) send(500, { error: 'Request failed' }); else res.end() }
  })
  server.on('close', () => transport.close())
  return server
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const cloudKeys = ['LMBOX_CONTAINER_ENSURE_URL', 'LMBOX_CONTAINER_SERVICE_TOKEN', 'LMBOX_CLOUD_USER_ID']
  const cloud = cloudKeys.some(key => process.env[key])
  if (cloud && !cloudKeys.every(key => process.env[key])) throw new Error('Cloud mode requires the ensure URL, service token and user ID')
  const transport = cloud
    ? createCloudTransport({ ensureUrl: process.env.LMBOX_CONTAINER_ENSURE_URL, serviceToken: process.env.LMBOX_CONTAINER_SERVICE_TOKEN, userId: process.env.LMBOX_CLOUD_USER_ID })
    : createTransport({ binary: resolve(root, `bin/ai${process.platform === 'win32' ? '.exe' : ''}`), worker: resolve(root, 'agent/dist/worker.js'), directory: resolve(process.env.LMBOX_WEB_DATA || resolve(root, 'data')) })
  const server = createWebAgentServer({ origin: process.env.LMBOX_WEB_ORIGIN, username: process.env.LMBOX_WEB_USERNAME, password: process.env.LMBOX_WEB_PASSWORD, site: resolve(root, 'site'), transport })
  server.listen(Number(process.env.PORT || 3102), process.env.HOST || '127.0.0.1')
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { transport.close(); server.close(); server.closeAllConnections() })
}
