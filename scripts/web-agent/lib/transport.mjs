import { spawn } from 'node:child_process'

// HTTP owns authentication; the existing Rust CLI owns jobs and executes tools.
export function createTransport({ binary, worker, directory, node = process.execPath }) {
  let child, buffer = ''
  const pending = new Map()
  function fail() {
    for (const value of pending.values()) { clearTimeout(value.timer); value.reject(new Error('Agent service unavailable')) }
    pending.clear()
  }
  function close() {
    const running = child; child = undefined; buffer = ''; fail()
    if (!running) return
    running.stdin.end()
    const timer = setTimeout(() => running.kill('SIGKILL'), 10000)
    timer.unref(); running.once('close', () => clearTimeout(timer))
  }
  function start() {
    if (child) return child
    const running = spawn(binary, ['unused-python', 'unused-engine', directory, node, worker], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } })
    child = running
    running.stderr.resume(); running.stdin.on('error', close); running.stdout.setEncoding('utf8')
    running.stdout.on('data', chunk => {
      if (child !== running) return
      buffer += chunk
      if (Buffer.byteLength(buffer) > 48 * 1024 * 1024) { close(); return }
      let end
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1)
        try {
          const reply = JSON.parse(line)
          const key = `${reply.projectId}:${reply.requestId}`
          const value = pending.get(key)
          if (value) { pending.delete(key); clearTimeout(value.timer); value.resolve(reply) }
        } catch { close(); return }
      }
    })
    for (const event of ['error', 'close']) running.once(event, () => { if (child === running) { child = undefined; buffer = ''; fail() } })
    return running
  }
  return {
    close,
    request(request) {
      if (pending.size >= 32) return Promise.reject(new Error('Agent service busy'))
      const key = `${request.projectId}:${request.requestId}`
      if (pending.has(key)) return Promise.reject(new Error('Request already pending'))
      return new Promise((resolve, reject) => {
        const running = start()
        const timer = setTimeout(() => { pending.delete(key); reject(new Error('Agent response timeout')) }, 110000)
        pending.set(key, { resolve, reject, timer })
        running.stdin.write(JSON.stringify(request) + '\n')
      })
    },
  }
}
