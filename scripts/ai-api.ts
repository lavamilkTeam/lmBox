import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const REQUEST_LIMIT = 4 * 1024 * 1024
const RESPONSE_LIMIT = 48 * 1024 * 1024
/** Local HTTP transport only. Rust owns jobs, child lifetimes and input versions. */
export function aiApi(): Plugin {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const config = join(root, '.tools/ai/runtime.env')
  if (existsSync(config)) loadEnvFile(config)
  const binary = join(root, `src-rust/target/debug/ai${process.platform === 'win32' ? '.exe' : ''}`)
  const python = process.env.LMBOX_AI_PYTHON || join(root, '.tools/ai/venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  let child: ReturnType<typeof spawn> | undefined
  let buffer = ''
  const pending = new Map<string, { resolve: (value: unknown) => void; reject: () => void; timer: ReturnType<typeof setTimeout> }>()
  function rejectAll() {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject() }
    pending.clear()
  }
  function stop() {
    const running = child; child = undefined; buffer = ''; rejectAll()
    if (!running) return
    running.stdin?.end()
    const timer = setTimeout(() => running.kill('SIGKILL'), 30000)
    timer.unref(); running.once('close', () => clearTimeout(timer))
  }
  function start() {
    if (child) return child
    if (!existsSync(binary)) throw new Error('AI 服务尚未构建，请运行 npm run build:ai。')
    if (!existsSync(python)) throw new Error('AI 运行环境尚未配置，请运行 npm run setup:ai。')
    const running = spawn(binary, [python, join(root, 'engine/src'), join(root, '.tools/ai/jobs')], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] })
    child = running
    running.stdin!.on('error', () => {})
    running.stderr!.resume()
    running.stdout!.setEncoding('utf8')
    running.stdout!.on('data', (chunk: string) => {
      if (child !== running) return
      buffer += chunk
      if (Buffer.byteLength(buffer) > RESPONSE_LIMIT) { stop(); return }
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
    running.once('error', () => { if (child === running) { child = undefined; buffer = ''; rejectAll() } })
    running.once('close', () => { if (child === running) { child = undefined; buffer = ''; rejectAll() } })
    return running
  }
  function middleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (req.url !== '/api/ai') return next()
    const send = (status: number, value: unknown) => {
      if (!res.destroyed && !res.writableEnded) {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value))
      }
    }
    if (req.method !== 'POST') return send(405, { error: '请使用 AI 操作接口。' })
    if (req.headers['sec-fetch-site'] === 'cross-site' || req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(403, { error: '请求来源不受支持。' })
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: '请求格式无效。' })
    const chunks: Buffer[] = []; let bytes = 0
    req.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes <= REQUEST_LIMIT) chunks.push(chunk); else send(413, { error: 'AI 请求超过 4 MB。' }) })
    req.on('error', () => send(400, { error: '请求读取失败。' }))
    req.on('end', () => {
      if (res.destroyed || res.writableEnded) return
      if (pending.size >= 32) return send(429, { error: 'AI 服务繁忙，请稍后重试。' })
      let request: Record<string, unknown>
      try { request = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
      catch { return send(400, { error: '请求格式无效。' }) }
      if (!request || typeof request !== 'object' || !['projectId', 'requestId'].every(field => typeof request[field] === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(request[field]))) return send(400, { error: '任务标识无效。' })
      const key = `${request.projectId}:${request.requestId}`
      if (pending.has(key)) return send(409, { error: '请求已在处理中。' })
      try {
        const running = start()
        const timer = setTimeout(() => { pending.delete(key); send(504, { error: 'AI 服务响应超时，请重新查询任务状态。' }) }, 110000)
        pending.set(key, { timer, resolve: value => send(200, value), reject: () => send(503, { error: 'AI 服务已退出，请重新连接。' }) })
        // Disconnecting a status request does not cancel the underlying job.
        res.once('close', () => { const waiter = pending.get(key); if (waiter) clearTimeout(waiter.timer); pending.delete(key) })
        running.stdin!.write(`${JSON.stringify(request)}\n`)
      } catch (error) { send(503, { error: error instanceof Error ? error.message : 'AI 服务不可用。' }) }
    })
  }
  return { name: 'lmbox-local-ai',
    configureServer(server) { server.middlewares.use(middleware); server.httpServer?.once('close', stop) },
    configurePreviewServer(server) { server.middlewares.use(middleware); server.httpServer.once('close', stop) },
    closeBundle: stop,
  }
}
