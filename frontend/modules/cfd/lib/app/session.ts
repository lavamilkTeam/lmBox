import { useCfdSession } from '../domain/session'
import { cfdRequest } from '../../../../platform/desktop'
import type { CfdRequest } from '../../../../contracts'

// The queue outlives the view, so closing a background tab waits for its native request.
let queue: Promise<unknown> = Promise.resolve()
let generation = 0
let closing: Promise<void> | undefined
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation)
  queue = next.catch(() => undefined)
  return next
}
export function enqueueCfdOperation(operation: () => Promise<boolean>): Promise<boolean> {
  if (closing) return Promise.resolve(false)
  const current = generation
  return enqueue(() => closing || current !== generation ? Promise.resolve(false) : operation())
}
/** Release only this module's native session, after explicit user confirmation. */
export function closeCfdSession(): Promise<void> {
  if (closing) return closing
  generation++
  closing = enqueue(async () => {
    const session = useCfdSession()
    if (!session.projectId) return
    for (let attempt = 0; attempt < 2; attempt++) {
      const request: CfdRequest = { schemaVersion: 1, projectId: session.projectId, requestId: crypto.randomUUID(), expectedRevision: session.revision, operation: 'close', payload: {} }
      session.begin(request)
      try {
        const response = await cfdRequest(request)
        // A server restart or failed initialization may already have removed this session.
        if (!response.ok && response.error?.code === 'session_missing') { session.resetAfterClose(); return }
        if (!session.accept(request, response)) throw new Error('流体会话状态已变化，请重试关闭。')
        if (response.ok) { session.resetAfterClose(); return }
        if (response.error?.code === 'stale_revision' && attempt === 0) continue
        throw new Error(response.error?.message ?? '流体会话关闭失败。')
      } catch (error) {
        session.fail(request, error instanceof Error ? error.message : String(error))
        throw error
      }
    }
  }).finally(() => { closing = undefined })
  return closing
}
