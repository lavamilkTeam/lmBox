import { invoke, isTauri } from '@tauri-apps/api/core'
import type { PreviewRequest, PreviewResult } from '../../../contracts'

export function isNativeDesktop(): boolean {
  return typeof window !== 'undefined' && isTauri()
}

export async function nativePreview(request: PreviewRequest, signal: AbortSignal): Promise<PreviewResult> {
  const identity = { projectId: request.projectId, jobId: request.jobId }
  const aborted = () => new DOMException('已取消模型计算。', 'AbortError')
  if (signal.aborted) throw aborted()
  await invoke('preview_prepare', identity)
  // Registration completes before cancellation; run still consumes a cancelled reservation.
  const cancel = () => { void invoke('preview_cancel', identity).catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    if (signal.aborted) await invoke('preview_cancel', identity)
    const result = await invoke<PreviewResult>('preview_run', { request })
    if (signal.aborted) throw aborted()
    return result
  } catch (error) {
    if (signal.aborted) throw aborted()
    throw error instanceof Error ? error : new Error(String(error))
  } finally {
    signal.removeEventListener('abort', cancel)
  }
}

export async function saveTextFile(name: string, content: string, mime: string): Promise<boolean> {
  const safeName = name.replace(/[\\/:*?"<>|]/g, '_')
  if (isNativeDesktop()) {
    try { return await invoke<boolean>('save_artifact', { name: safeName, content }) }
    catch (error) { throw error instanceof Error ? error : new Error(String(error)) }
  }
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement('a'); link.href = url; link.download = safeName; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}
