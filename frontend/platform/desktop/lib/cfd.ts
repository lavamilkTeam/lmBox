import type { CfdRequest, CfdResponse, CfdState, CfdUiNode, CfdValue } from '../../../contracts'
import { isNativeDesktop, nativeCfdRequest, nativeSaveCfdFile, nativeChooseCfdPath } from './native'

const MAX_FILE = 24 * 1024 * 1024
const MAX_MESSAGE = 36 * 1024 * 1024
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 1024 * 1024
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const array = (value: unknown, limit: number): value is unknown[] => Array.isArray(value) && value.length <= limit
function validValue(value: unknown, depth = 0): value is CfdValue {
  if (depth > 64) return false
  if (value === null || typeof value === 'boolean' || text(value) || finite(value)) return true
  if (array(value, 100000)) return value.every(item => validValue(item, depth + 1))
  return record(value) && Object.keys(value).length <= 10000 && Object.values(value).every(item => validValue(item, depth + 1))
}
function node(value: unknown, depth = 0): value is CfdUiNode {
  return depth < 64 && record(value) && text(value.id) && text(value.kind) && text(value.qtClass) && text(value.name)
    && typeof value.enabled === 'boolean' && typeof value.visible === 'boolean'
    && (value.value === undefined || validValue(value.value))
    && (value.options === undefined || array(value.options, 100000) && value.options.every(text))
    && (value.children === undefined || array(value.children, 10000) && value.children.every(child => node(child, depth + 1)))
}
function state(value: unknown): value is CfdState {
  if (!record(value) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0
    || !record(value.runtime) || !text(value.runtime.freecadVersion) || !record(value.capabilities) || !validValue(value.capabilities)
    || !array(value.commands, 1000) || !record(value.document) || !text(value.document.name) || !text(value.document.label) || !array(value.document.objects, 10000)
    || !array(value.selection, 10000) || !array(value.dialogs, 100) || !array(value.geometry, 10000)
    || !array(value.plots, 1000) || !array(value.logs, 20000) || typeof value.busy !== 'boolean') return false
  return value.commands.every(command => record(command) && text(command.id) && text(command.label) && text(command.tooltip) && typeof command.enabled === 'boolean'
      && (command.commands === undefined || array(command.commands, 1000) && command.commands.every(text)))
    && value.document.objects.every(object => record(object) && text(object.id) && text(object.label) && text(object.type) && typeof object.visible === 'boolean'
      && (object.parentId === undefined || object.parentId === null || text(object.parentId))
      && array(object.properties, 10000) && object.properties.every(property => record(property) && text(property.name) && text(property.type)
        && text(property.group) && typeof property.readOnly === 'boolean' && validValue(property.value)
        && (property.options === undefined || array(property.options, 100000) && property.options.every(text))))
    && value.selection.every(selection => record(selection) && text(selection.objectId) && array(selection.subelements, 100000) && selection.subelements.every(text))
    && (value.editor === null || record(value.editor) && text(value.editor.id) && text(value.editor.title)
      && (value.editor.objectId === null || text(value.editor.objectId)) && array(value.editor.roots, 100) && value.editor.roots.every(root => node(root))
      && record(value.editor.actions) && typeof value.editor.actions.accept === 'boolean' && typeof value.editor.actions.reject === 'boolean')
    && value.dialogs.every(dialog => record(dialog) && text(dialog.id) && text(dialog.title) && text(dialog.text)
      && (dialog.roots === undefined || array(dialog.roots, 100) && dialog.roots.every(root => node(root)))
      && array(dialog.buttons, 100) && dialog.buttons.every(button => record(button) && text(button.id) && text(button.label) && text(button.role)))
    && value.geometry.every(mesh => {
      if (!record(mesh) || !text(mesh.objectId) || !text(mesh.label) || !coordinates(mesh.vertices) || !array(mesh.triangles, 6000000) || mesh.triangles.length % 3 !== 0) return false
      const vertexCount = mesh.vertices.length / 3
      const triangleCount = mesh.triangles.length / 3
      return mesh.triangles.every(index => integer(index) && index < vertexCount)
        && array(mesh.faces, 100000) && mesh.faces.every(face => record(face) && text(face.id) && integer(face.firstTriangle) && integer(face.triangleCount)
          && face.firstTriangle + face.triangleCount <= triangleCount)
        && array(mesh.edges, 100000) && mesh.edges.every(edge => record(edge) && text(edge.id) && coordinates(edge.vertices))
        && array(mesh.points, 100000) && mesh.points.every(point => record(point) && text(point.id) && array(point.position, 3) && point.position.length === 3 && point.position.every(finite))
        && array(mesh.solids, 100000) && mesh.solids.every(solid => record(solid) && text(solid.id) && array(solid.faces, 100000) && solid.faces.every(text))
    })
    && value.logs.every(log => record(log) && text(log.level) && text(log.text))
    && value.plots.every(plot => record(plot) && text(plot.id) && text(plot.title) && text(plot.xLabel) && text(plot.yLabel)
      && (plot.logarithmic === undefined || typeof plot.logarithmic === 'boolean')
      && array(plot.series, 1000) && plot.series.every(series => record(series) && text(series.name)
        && array(series.points, 1000000) && series.points.every(point => array(point, 2) && point.length === 2 && point.every(finite))))
    && (value.pendingAction === null || record(value.pendingAction) && text(value.pendingAction.requestId) && text(value.pendingAction.operation))
    && (value.lastAction === undefined || value.lastAction === null || record(value.lastAction) && text(value.lastAction.requestId)
      && text(value.lastAction.operation) && typeof value.lastAction.ok === 'boolean' && (value.lastAction.error === undefined || text(value.lastAction.error)))
}
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const coordinates = (value: unknown): value is number[] => array(value, 6000000) && value.length % 3 === 0 && value.every(finite)
function validate(value: unknown, request: CfdRequest): CfdResponse {
  if (!record(value) || value.schemaVersion !== 1 || value.projectId !== request.projectId || value.requestId !== request.requestId
    || value.inputRevision !== request.expectedRevision || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || typeof value.ok !== 'boolean') throw new Error('流体分析响应与当前请求不匹配。')
  if (value.state !== undefined && !state(value.state)) throw new Error('流体分析返回了无效界面或几何数据。')
  if (value.error !== undefined && (!record(value.error) || !text(value.error.code) || !text(value.error.message))) throw new Error('流体分析错误响应无效。')
  if (value.ok && !value.state && request.operation !== 'close') throw new Error('流体分析未返回当前工程状态。')
  if (value.artifact !== undefined && (!record(value.artifact) || !text(value.artifact.name) || typeof value.artifact.base64 !== 'string' || value.artifact.base64.length > MAX_FILE * 4 / 3 + 4)) throw new Error('流体工程文件无效或超过大小限制。')
  return value as unknown as CfdResponse
}
export async function cfdRequest(request: CfdRequest, signal?: AbortSignal): Promise<CfdResponse> {
  const body = JSON.stringify(request)
  if (body.length > MAX_MESSAGE) throw new Error('流体分析请求超过大小限制。')
  if (signal?.aborted) throw new DOMException('已取消请求。', 'AbortError')
  if (isNativeDesktop()) {
    const value = await nativeCfdRequest(request)
    if (signal?.aborted) throw new DOMException('已取消请求。', 'AbortError')
    return validate(value, request)
  }
  const response = await fetch('/api/cfd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000) })
  const content = await response.text()
  if (content.length > MAX_MESSAGE) throw new Error('流体分析响应超过大小限制。')
  let value: unknown
  try { value = JSON.parse(content) }
  catch { throw new Error('流体分析服务不可用，请从本地应用打开。') }
  if (!response.ok) throw new Error(record(value) && typeof value.error === 'string' ? value.error : '流体分析请求失败。')
  return validate(value, request)
}
/** Retain the native session across a development reload of this browser tab. */
export function getCfdSessionId(): string {
  const key = 'lmbox.cfd.session'
  const stored = sessionStorage.getItem(key)
  if (stored && /^[A-Za-z0-9_-]{1,80}$/.test(stored)) return stored
  const id = crypto.randomUUID()
  sessionStorage.setItem(key, id)
  return id
}
export async function readCfdFile(file: File): Promise<{ name: string; base64: string }> {
  if (!/\.(fcstd|step|stp|brep|iges|igs|stl)$/i.test(file.name)) throw new Error('请选择支持的工程或几何文件。')
  if (!file.size || file.size > MAX_FILE) throw new Error('文件不能为空且不能超过 24 MB。')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
  return { name: file.name.replace(/[\\/:*?"<>|]/g, '_'), base64: btoa(binary) }
}
/** Only the desktop host can grant a path to an active native file dialog. */
export async function chooseCfdPath(request: CfdRequest): Promise<CfdResponse | undefined> {
  if (request.operation !== 'dialogResponse' || typeof request.payload.dialogId !== 'string' || Object.keys(request.payload).length !== 1) throw new Error('文件选择请求无效。')
  if (!isNativeDesktop()) return undefined
  return validate(await nativeChooseCfdPath(request), request)
}
export async function saveCfdFile(name: string, base64: string): Promise<boolean> {
  if (!/\.fcstd$/i.test(name) || base64.length > MAX_FILE * 4 / 3 + 4) throw new Error('工程文件无效或超过大小限制。')
  let binary: string
  try { binary = atob(base64) } catch { throw new Error('工程文件编码无效。') }
  if (!binary.length || binary.length > MAX_FILE) throw new Error('工程文件为空或超过大小限制。')
  const safeName = name.replace(/[\\/:*?"<>|]/g, '_')
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  if (isNativeDesktop()) return nativeSaveCfdFile(safeName, Array.from(bytes))
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
  const link = document.createElement('a'); link.href = url; link.download = safeName; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}
