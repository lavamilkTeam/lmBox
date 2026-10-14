import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

/** Local transport only: trusted executable and runtime paths, bounded requests/processes. */
export function propulsionApi(): Plugin {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const binary = `${root}src-rust/target/debug/propulsion${process.platform === 'win32' ? '.exe' : ''}`
  const active = new Set<ReturnType<typeof spawn>>()
  function middleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (req.url !== '/api/propulsion') return next()
    const send = (status: number, data: unknown) => {
      if (!res.destroyed && !res.writableEnded) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)) }
    }
    if (req.method !== 'POST') return send(405, { error: '请使用计算操作。' })
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(403, { error: '请求来源不受支持。' })
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: '请求格式无效。' })
    if (active.size >= 2) return send(429, { error: '计算繁忙，请稍后重试。' })
    const chunks: Buffer[] = []; let size = 0
    req.on('data', (chunk: Buffer) => { size += chunk.length; if (size <= 65536) chunks.push(chunk); else send(413, { error: '计算请求超过大小限制。' }) })
    req.on('end', () => {
      if (res.destroyed || res.writableEnded) return
      if (active.size >= 2) return send(429, { error: '计算繁忙，请稍后重试。' })
      if (!existsSync(binary) || !existsSync(`${root}.tools/propulsion/runtime`)) return send(503, { error: '计算引擎尚未配置，请先运行 npm run build:backend。' })
      let input: string
      try { input = JSON.stringify(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { return send(400, { error: '计算请求格式无效。' }) }
      const child = spawn(binary, [`${root}.tools/propulsion/runtime`, `${root}.tools/cea/runtime`], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] })
      active.add(child)
      const output: Buffer[] = []; const errors: Buffer[] = []; let bytes = 0; let errorBytes = 0
      const stop = () => { child.kill('SIGKILL') }
      const timer = setTimeout(() => { send(504, { error: '计算超时，请检查输入后重试。' }); stop() }, 60000)
      res.on('close', stop)
      child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes <= 2 * 1024 * 1024) output.push(chunk); else { send(502, { error: '计算结果超过大小限制。' }); stop() } })
      child.stderr.on('data', (chunk: Buffer) => { errorBytes += chunk.length; if (errorBytes <= 4096) errors.push(chunk) })
      child.stdin.on('error', () => {})
      child.once('error', () => send(503, { error: '无法启动计算引擎，请检查后端安装。' }))
      child.once('close', code => {
        active.delete(child); clearTimeout(timer); res.off('close', stop)
        if (res.destroyed || res.writableEnded) return
        if (code !== 0) return send(422, { error: Buffer.concat(errors).toString('utf8').trim() || '计算失败，请检查输入。' })
        try { send(200, JSON.parse(Buffer.concat(output).toString('utf8'))) }
        catch { send(502, { error: '计算引擎未返回有效结果。' }) }
      })
      child.stdin.end(input)
    })
  }
  const stopAll = () => { for (const child of active) child.kill('SIGKILL') }
  return { name: 'lmbox-local-propulsion',
    configureServer(server) { server.middlewares.use(middleware); server.httpServer?.once('close', stopAll) },
    configurePreviewServer(server) { server.middlewares.use(middleware); server.httpServer.once('close', stopAll) },
  }
}
