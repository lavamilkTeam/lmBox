import { invoke } from '@tauri-apps/api/core'
import type { AiArtifact, AiCapability, AiJob, AiNodeDefinition, AiRequest, AiResponse } from '../../../contracts'
import { isNativeDesktop } from './native'

const MAX_FILE = 32 * 1024 * 1024
const MAX_REQUEST = 4 * 1024 * 1024
const MAX_RESPONSE = 48 * 1024 * 1024
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, limit = 65536): value is string => typeof value === 'string' && value.length <= limit
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const array = (value: unknown, limit: number): value is unknown[] => Array.isArray(value) && value.length <= limit
const safeName = (value: unknown): value is string => text(value, 255) && value.length > 0 && !/[\\/\u0000-\u001f:*?"<>|]/.test(value) && value !== '.' && value !== '..'
const attachmentName = (value: string) => [...value].length <= 128 && /^[\p{L}\p{N}_][\p{L}\p{N}_ .-]*$/u.test(value) && !value.includes('..') && !/[ .]$/.test(value)
const errorInfo = (value: unknown) => record(value) && text(value.code, 128) && text(value.message)
function jsonValue(value: unknown, depth = 0): boolean {
  if (depth > 40) return false
  if (value === null || typeof value === 'boolean' || text(value) || typeof value === 'number' && Number.isFinite(value)) return true
  if (array(value, 10000)) return value.every(item => jsonValue(item, depth + 1))
  return record(value) && Object.keys(value).length <= 10000 && Object.values(value).every(item => jsonValue(item, depth + 1))
}
function artifact(value: unknown): value is AiArtifact {
  return record(value) && safeName(value.id) && safeName(value.name) && text(value.mimeType, 128) && /^[\w.+-]+\/[\w.+-]+$/.test(value.mimeType)
}
function node(value: unknown): value is AiNodeDefinition {
  return record(value) && text(value.type, 256) && text(value.title, 512) && text(value.category, 512)
    && array(value.inputs, 512) && value.inputs.every(input => record(input) && text(input.name, 256) && text(input.type, 256) && typeof input.required === 'boolean'
      && (input.choices === undefined || array(input.choices, 10000) && input.choices.every(choice => text(choice) || typeof choice === 'boolean' || typeof choice === 'number' && Number.isFinite(choice)))
      && (input.default === undefined || jsonValue(input.default))
      && (input.min === undefined || typeof input.min === 'number' && Number.isFinite(input.min))
      && (input.max === undefined || typeof input.max === 'number' && Number.isFinite(input.max)))
    && array(value.outputs, 512) && value.outputs.every(output => record(output) && text(output.name, 256) && text(output.type, 256))
}
function job(value: unknown, request: AiRequest): value is AiJob {
  return record(value) && text(value.jobId, 128) && /^[A-Za-z0-9_-]+$/.test(value.jobId)
    && value.capability === request.capability && value.inputRevision === request.inputRevision
    && (request.jobId === undefined || request.jobId === value.jobId)
    && ['running', 'succeeded', 'failed', 'cancelled'].includes(String(value.status))
    && array(value.events, 1000) && value.events.every(event => record(event) && text(event.message))
    && (value.result === undefined || record(value.result) && (value.result.text === undefined || text(value.result.text, 1024 * 1024))
      && array(value.result.artifacts, 128) && value.result.artifacts.every(artifact))
    && (value.error === undefined || errorInfo(value.error))
    && (value.status !== 'succeeded' || value.result !== undefined)
    && (value.status !== 'failed' || value.error !== undefined)
}
function validate(value: unknown, request: AiRequest): AiResponse {
  if (!record(value) || value.schemaVersion !== 1 || value.projectId !== request.projectId || value.requestId !== request.requestId
    || value.inputRevision !== request.inputRevision || value.capability !== request.capability || typeof value.ok !== 'boolean') throw new Error('AI 响应与当前任务不匹配。')
  if (!value.ok) {
    if (!errorInfo(value.error)) throw new Error('AI 服务返回了无效错误。')
    return value as unknown as AiResponse
  }
  if (!record(value.data)) throw new Error('AI 服务未返回结果。')
  const data = value.data
  if (request.operation === 'inspect') {
    if (typeof data.configured !== 'boolean' || (request.capability === 'video'
      ? !array(data.nodes, 10000) || !data.nodes.every(node)
      : !text(data.model, 256) || !array(data.tools, 100) || !data.tools.every(tool => text(tool, 256)))) throw new Error('AI 服务返回了无效配置。')
  } else if (request.operation === 'artifact') {
    if (!safeName(data.name) || !text(data.mimeType, 128) || !text(data.base64, Math.ceil(MAX_FILE / 3) * 4)) throw new Error('AI 产物无效或超过 32 MB。')
  } else if (!job(data.job, request)) throw new Error('AI 任务状态无效或版本不匹配。')
  return value as unknown as AiResponse
}
async function readResponse(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('AI 服务没有响应内容。')
  const chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_RESPONSE) { await reader.cancel(); throw new Error('AI 响应超过大小限制。') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  try { return JSON.parse(new TextDecoder().decode(bytes)) }
  catch { throw new Error('AI 服务不可用，请从本地应用打开。') }
}
/** A local rejection is known not to have created a paid provider job. */
export class AiRequestNotSentError extends Error {}
export async function aiRequest(request: AiRequest): Promise<AiResponse> {
  let body: string
  try { body = JSON.stringify(request) } catch { throw new AiRequestNotSentError('AI 请求无法序列化。') }
  if (!integer(request.inputRevision) || new TextEncoder().encode(body).length > MAX_REQUEST) throw new AiRequestNotSentError('AI 请求无效或超过 4 MB。')
  if (isNativeDesktop()) {
    try { return validate(await invoke('ai_request', { request }), request) }
    catch (error) { throw error instanceof Error ? error : new Error(String(error)) }
  }
  const response = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(120000) })
  const value = await readResponse(response)
  if (!response.ok) throw new Error(record(value) && text(value.error) ? value.error : 'AI 服务请求失败。')
  return validate(value, request)
}
const projectIds: Partial<Record<AiCapability, string>> = {}
/** Drafts are session-only; a reload starts a new project rather than reusing an old revision. */
export function getAiProjectId(capability: AiCapability): string {
  return projectIds[capability] ??= crypto.randomUUID()
}
export function getAiRequestId(): string { return crypto.randomUUID() }
export async function readAiWorkflowFile(file: File): Promise<unknown> {
  if (!file.size || file.size > MAX_REQUEST || !/\.json$/i.test(file.name)) throw new Error('请选择不超过 4 MB 的工作流 JSON。')
  try { return JSON.parse(await file.text()) }
  catch { throw new Error('工作流 JSON 格式无效。') }
}
export async function readAiTextFiles(files: File[]): Promise<{ name: string; content: string }[]> {
  if (files.length > 16 || files.reduce((total, file) => total + file.size, 0) > 1024 * 1024) throw new Error('最多添加 16 个文件，总大小不能超过 1 MB。')
  const names = new Set<string>(); const result = []
  for (const file of files) {
    if (!attachmentName(file.name) || names.has(file.name)) throw new Error('附件文件名无效或重复。')
    names.add(file.name)
    let content: string
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) }
    catch { throw new Error('附件必须是 UTF-8 文本文件。') }
    if (content.includes('\0')) throw new Error('附件必须是文本文件。')
    result.push({ name: file.name, content })
  }
  return result
}
export async function loadAiArtifact(request: AiRequest): Promise<{ url: string; name: string; mimeType: string; dispose: () => void }> {
  if (request.operation !== 'artifact') throw new Error('产物请求无效。')
  const response = await aiRequest(request)
  if (!response.ok) throw new Error(response.error!.message)
  const { name, mimeType, base64 } = response.data!
  let binary: string
  try { binary = atob(base64!) } catch { throw new Error('AI 产物编码无效。') }
  if ((!binary.length && mimeType !== 'text/plain') || binary.length > MAX_FILE) throw new Error('AI 产物为空或超过 32 MB。')
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType! }))
  return { url, name: name!, mimeType: mimeType!, dispose: () => URL.revokeObjectURL(url) }
}
export async function saveAiArtifact(request: AiRequest): Promise<boolean> {
  if (request.operation !== 'artifact') throw new Error('产物请求无效。')
  if (isNativeDesktop()) {
    try { return await invoke<boolean>('save_ai_artifact', { request }) }
    catch (error) { throw error instanceof Error ? error : new Error(String(error)) }
  }
  const file = await loadAiArtifact(request)
  const link = document.createElement('a'); link.href = file.url; link.download = file.name; link.click()
  setTimeout(file.dispose, 1000)
  return true
}
