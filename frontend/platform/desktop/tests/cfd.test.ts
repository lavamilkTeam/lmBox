import { afterEach, describe, expect, it, vi } from 'vitest'
import { cfdRequest, readCfdFile, saveCfdFile } from '../index'
import type { CfdRequest } from '../../../contracts'

const request: CfdRequest = { schemaVersion: 1, projectId: 'project', requestId: 'request', expectedRevision: 2, operation: 'poll', payload: {} }
const state = () => ({ revision: 1, runtime: { freecadVersion: '1.1.3' }, capabilities: {}, commands: [],
  document: { name: 'Document', label: '工程', objects: [] }, selection: [], editor: null, dialogs: [], geometry: [], plots: [], logs: [], busy: false, pendingAction: null })
const response = () => ({ schemaVersion: 1, projectId: 'project', requestId: 'request', inputRevision: 2, revision: 3, ok: true, state: state() })
const fetchResponse = (value: unknown, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(value), { status })))
afterEach(() => vi.unstubAllGlobals())

describe('CFD transport boundary', () => {
  it('preserves the Rust revision and backend action state', async () => {
    const value = response(); value.state.busy = true
    fetchResponse(value)
    await expect(cfdRequest(request)).resolves.toEqual(value)
    expect(fetch).toHaveBeenCalledWith('/api/cfd', expect.objectContaining({ method: 'POST', body: JSON.stringify(request) }))
  })
  it('rejects a response for another request or input revision', async () => {
    fetchResponse({ ...response(), requestId: 'old-request' })
    await expect(cfdRequest(request)).rejects.toThrow('不匹配')
    fetchResponse({ ...response(), inputRevision: 1 })
    await expect(cfdRequest(request)).rejects.toThrow('不匹配')
  })
  it('rejects invalid native geometry instead of passing it to the renderer', async () => {
    const value = response()
    fetchResponse({ ...value, state: { ...value.state, geometry: [{ objectId: 'Box', vertices: [0, 0, 0], triangles: [0, 1, 2], faces: [] }] } })
    await expect(cfdRequest(request)).rejects.toThrow('无效界面或几何')
  })
  it('keeps explicit backend failure distinct from a successful queued action', async () => {
    const value = { ...response(), ok: false, error: { code: 'stale_revision', message: '输入版本已改变。' } }
    fetchResponse(value)
    await expect(cfdRequest(request)).resolves.toEqual(value)
    fetchResponse({ error: '尚未配置' }, 503)
    await expect(cfdRequest(request)).rejects.toThrow('尚未配置')
  })
  it('bounds file types and byte size before reading file contents', async () => {
    const bytes = new Uint8Array([80, 75, 3, 4])
    const file = { name: 'part.FCStd', size: 4, arrayBuffer: async () => bytes.buffer } as File
    await expect(readCfdFile(file)).resolves.toEqual({ name: 'part.FCStd', base64: 'UEsDBA==' })
    await expect(readCfdFile({ ...file, name: 'tool.py' })).rejects.toThrow('支持')
    await expect(readCfdFile({ ...file, size: 25 * 1024 * 1024 })).rejects.toThrow('24 MB')
    await expect(saveCfdFile('part.py', 'UEsDBA==')).rejects.toThrow('无效')
  })
})
