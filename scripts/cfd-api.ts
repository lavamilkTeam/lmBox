import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const LIMIT = 36 * 1024 * 1024
/** Development HTTP transport; session ownership and native process policy belong to Rust. */
export function cfdApi(): Plugin {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const binary = `${root}src-rust/target/debug/cfd${process.platform === 'win32' ? '.exe' : ''}`
  const config = `${root}.tools/cfd/runtime.json`
  let child: ReturnType<typeof spawn> | undefined
  let buffer = ''
  const pending = new Map<string, { resolve: (value: unknown) => void; reject: (message: string) => void; timer: ReturnType<typeof setTimeout> }>()
  function rejectAll(message: string) {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(message) }
    pending.clear()
  }
  function stop() {
    const running = child; child = undefined; buffer = ''
    rejectAll('流体分析服务已关闭。')
    if (!running) return
    running.stdin?.end()
    const timer = setTimeout(() => running.kill('SIGKILL'), 20000)
    timer.unref(); running.once('close', () => clearTimeout(timer))
  }
  function start() {
    if (child) return child
    if (!existsSync(binary) || !existsSync(config)) throw new Error('流体分析运行环境尚未配置，请先运行 npm run setup:cfd。')
    const running = spawn(binary, [config, `${root}engine/src`], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] })
    child = running
    running.stdin.on('error', () => {})
    running.stderr.resume()
    running.stdout.setEncoding('utf8')
    running.stdout.on('data', (chunk: string) => {
      if (child !== running) return
      buffer += chunk
      if (Buffer.byteLength(buffer) > LIMIT) { stop(); return }
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
        try {
          const response = JSON.parse(line)
          const key = `${response.projectId}:${response.requestId}`
          const waiter = pending.get(key)
          if (waiter) { clearTimeout(waiter.timer); pending.delete(key); waiter.resolve(response) }
        } catch { stop(); return }
      }
    })
    running.once('error', () => { if (child === running) { child = undefined; rejectAll('无法启动流体分析服务。') } })
    running.once('close', () => { if (child === running) { child = undefined; buffer = ''; rejectAll('流体分析服务异常退出，请重新打开工程。') } })
    return running
  }
  function middleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (req.url !== '/api/cfd') return next()
    const send = (status: number, value: unknown) => {
      if (!res.destroyed && !res.writableEnded) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
    }
    if (req.method !== 'POST') return send(405, { error: '请使用流体分析操作。' })
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(403, { error: '请求来源不受支持。' })
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: '请求格式无效。' })
    const chunks: Buffer[] = []; let bytes = 0
    req.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes <= LIMIT) chunks.push(chunk); else send(413, { error: '请求超过大小限制。' }) })
    req.on('end', () => {
      if (res.destroyed || res.writableEnded) return
      if (pending.size >= 32) return send(429, { error: '流体分析繁忙，请稍后重试。' })
      let request: Record<string, unknown>
      try { request = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
      catch { return send(400, { error: '请求格式无效。' }) }
      if (!request || typeof request !== 'object' || typeof request.projectId !== 'string' || typeof request.requestId !== 'string'
        || !/^[A-Za-z0-9_-]{1,128}$/.test(request.projectId) || !/^[A-Za-z0-9_-]{1,128}$/.test(request.requestId)) return send(400, { error: '工程或请求标识无效。' })
      const key = `${request.projectId}:${request.requestId}`
      if (pending.has(key)) return send(409, { error: '请求已在处理中。' })
      try {
        const running = start()
        const timer = setTimeout(() => { pending.delete(key); send(504, { error: '流体分析响应超时，请检查运行日志。' }) }, 110000)
        pending.set(key, { timer, resolve: value => send(200, value), reject: error => send(503, { error }) })
        // Disconnecting a status request must not terminate a running native solver.
        res.once('close', () => { const waiter = pending.get(key); if (waiter) clearTimeout(waiter.timer); pending.delete(key) })
        running.stdin?.write(`${JSON.stringify(request)}\n`)
      } catch (error) { send(503, { error: (error as Error).message }) }
    })
  }
  return { name: 'lmbox-local-cfd',
    configureServer(server) { server.middlewares.use(middleware); server.httpServer?.once('close', stop) },
    configurePreviewServer(server) { server.middlewares.use(middleware); server.httpServer.once('close', stop) },
    closeBundle: stop,
  }
}
