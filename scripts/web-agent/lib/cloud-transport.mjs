const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const runtimeToken = /^[0-9a-f]{64}\.[A-Za-z0-9_-]{43}$/

async function readJson(response, limit) {
  if (!response.body) throw new Error('Empty cloud response')
  const reader = response.body.getReader()
  const chunks = []; let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > limit) { await reader.cancel(); throw new Error('Cloud response too large') }
      chunks.push(next.value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally { reader.releaseLock() }
}

function endpoint(value) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid cloud endpoint')
  return url.href.replace(/\/+$/, '')
}

export function createCloudTransport({ ensureUrl, serviceToken, userId, fetch: fetcher = fetch, ensureTimeoutMs = 30000, requestTimeoutMs = 110000 }) {
  const base = endpoint(ensureUrl)
  if (typeof serviceToken !== 'string' || serviceToken.length < 32 || !uuid.test(userId || '')) throw new Error('Invalid cloud container configuration')
  let runtime, ensuring
  const pending = new Map(), controllers = new Set()

  async function ensure() {
    if (ensuring) return ensuring
    ensuring = (async () => {
      const controller = new AbortController(); controllers.add(controller)
      const timer = setTimeout(() => controller.abort(), ensureTimeoutMs)
      try {
        const response = await fetcher(base, { method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { Authorization: `Bearer ${serviceToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); throw new Error('Container ensure failed') }
        const value = await readJson(response, 65536)
        if (value?.status !== 'ready' || typeof value.runtimeUrl !== 'string' || !runtimeToken.test(value.runtimeToken || '')) throw new Error('Invalid container response')
        const url = endpoint(value.runtimeUrl)
        runtime = { url, token: value.runtimeToken }
        return runtime
      } catch { runtime = undefined; throw new Error('Cloud container unavailable') }
      finally { clearTimeout(timer); controllers.delete(controller); ensuring = undefined }
    })()
    return ensuring
  }

  async function request(request) {
    const key = `${request.projectId}:${request.requestId}`
    if (pending.size >= 32 || pending.has(key)) throw new Error('Agent service busy')
    const controller = new AbortController(); controllers.add(controller)
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
    pending.set(key, controller)
    try {
      const active = request.operation === 'inspect' || !runtime ? await ensure() : runtime
      const response = await fetcher(`${active.url}/v1/agent`, { method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${active.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); throw new Error('Remote agent failed') }
      const value = await readJson(response, 48 * 1024 * 1024)
      if (value?.projectId !== request.projectId || value?.requestId !== request.requestId) throw new Error('Invalid remote agent response')
      return value
    } catch (cause) {
      runtime = undefined
      if (cause instanceof Error && cause.message === 'Cloud container unavailable') throw cause
      throw new Error('Cloud agent unavailable')
    } finally { clearTimeout(timer); controllers.delete(controller); pending.delete(key) }
  }

  function close() { runtime = undefined; for (const controller of controllers) controller.abort(); controllers.clear(); pending.clear() }
  return { request, close }
}
