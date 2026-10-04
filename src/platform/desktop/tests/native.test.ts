import { afterEach, expect, it, vi } from 'vitest'
import { generatePreview, saveModelArtifact } from '../index'
import fixture from '../../../../contracts/fixtures/v1/preview.json'
import type { PreviewRequest } from '../../../contracts'
const native = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: native.invoke }))
const request=fixture as PreviewRequest

afterEach(() => { vi.unstubAllGlobals(); native.invoke.mockReset() })
it('cancels a registered native task even when aborted during registration', async () => {
  vi.stubGlobal('window', {})
  const abort=new AbortController()
  native.invoke.mockImplementation(async (command:string) => {
    if(command==='preview_prepare') abort.abort()
    if(command==='preview_run') throw 'cancelled'
  })
  await expect(generatePreview(request,abort.signal)).rejects.toMatchObject({name:'AbortError'})
  expect(native.invoke.mock.calls.map(call=>call[0])).toEqual(['preview_prepare','preview_cancel','preview_run'])
})
it('reports a cancelled save and native disk errors without claiming success', async () => {
  vi.stubGlobal('window', {})
  native.invoke.mockResolvedValueOnce(false).mockRejectedValueOnce('磁盘已满')
  const artifact={format:'stl' as const,content:'solid test\nendsolid test'}
  expect(await saveModelArtifact(artifact,'board')).toBe(false)
  await expect(saveModelArtifact(artifact,'board')).rejects.toThrow('磁盘已满')
})
it('validates native results with the same identity checks as browser results',async()=>{
  vi.stubGlobal('window', {})
  native.invoke.mockResolvedValueOnce(undefined).mockResolvedValueOnce({...request,jobId:'stale'})
  await expect(generatePreview(request,new AbortController().signal)).rejects.toThrow('不匹配')
})
