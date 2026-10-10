import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiRequestNotSentError, aiRequest, loadAiArtifact, readAiTextFiles, readAiWorkflowFile } from '../index'
import type { AiRequest } from '../../../contracts'

const request: AiRequest = { schemaVersion: 1, projectId: 'project', requestId: 'request', inputRevision: 2, capability: 'agent', operation: 'status', jobId: 'job-1' }
const response = () => ({ schemaVersion: 1, projectId: 'project', requestId: 'request', inputRevision: 2, capability: 'agent', ok: true,
  data: { job: { jobId: 'job-1', capability: 'agent', inputRevision: 2, status: 'running', events: [{ message: '执行工具' }] } } })
function reply(value: unknown, status = 200) { vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(value), { status }))) }
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('AI transport public boundary', () => {
  it('keeps running jobs distinct from success and matches all ownership fields', async () => {
    reply(response())
    await expect(aiRequest(request)).resolves.toEqual(response())
    for (const change of [{ projectId: 'other' }, { requestId: 'old' }, { inputRevision: 1 }, { capability: 'video' }]) {
      reply({ ...response(), ...change })
      await expect(aiRequest(request)).rejects.toThrow('不匹配')
    }
    reply({ ...response(), data: { job: { ...response().data.job, jobId: 'another-job' } } })
    await expect(aiRequest(request)).rejects.toThrow('不匹配')
  })
  it('rejects incomplete successful results and preserves actionable backend errors', async () => {
    reply({ ...response(), data: { job: { ...response().data.job, status: 'succeeded' } } })
    await expect(aiRequest(request)).rejects.toThrow('无效')
    const failure = { ...response(), ok: false, data: undefined, error: { code: 'unconfigured', message: '请配置模型。' } }
    reply(failure)
    await expect(aiRequest(request)).resolves.toEqual(failure)
    reply({ error: '运行环境尚未配置。' }, 503)
    await expect(aiRequest(request)).rejects.toThrow('尚未配置')
  })
  it('validates metadata before a catalog becomes editable UI', async () => {
    const inspect = { ...request, capability: 'video' as const, operation: 'inspect' as const, jobId: undefined }
    reply({ ...response(), capability: 'video', data: { configured: true, nodes: [{ type: 'Broken', inputs: null }] } })
    await expect(aiRequest(inspect)).rejects.toThrow('无效配置')
  })
  it('does not accept path-shaped attachment names, duplicate files or binary text', async () => {
    const file = (name: string, content: string) => new File([content], name)
    await expect(readAiTextFiles([file('input.txt', '你好')])).resolves.toEqual([{ name: 'input.txt', content: '你好' }])
    await expect(readAiTextFiles([file('../secret', 'x')])).rejects.toThrow('文件名')
    await expect(readAiTextFiles([file('a.txt', 'a'), file('a.txt', 'b')])).rejects.toThrow('重复')
    await expect(readAiTextFiles([file('binary.txt', 'a\0b')])).rejects.toThrow('文本')
    for (const name of ['notes(1).txt', '.env', 'a..txt', 'a.txt ']) await expect(readAiTextFiles([file(name, 'x')])).rejects.toThrow('文件名')
    await expect(readAiWorkflowFile(file('workflow.json', '{broken'))).rejects.toThrow('格式')
  })
  it('distinguishes local rejection from an uncertain server submission', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(aiRequest({ ...request, operation: 'start', jobId: undefined, payload: { prompt: 'x'.repeat(4 * 1024 * 1024) } })).rejects.toBeInstanceOf(AiRequestNotSentError)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('bounds and scopes output previews and releases object URLs', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fixture')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const artifactRequest = { ...request, operation: 'artifact' as const, payload: { artifactId: 'answer.txt' } }
    reply({ ...response(), data: { name: 'answer.txt', mimeType: 'text/plain', base64: 'NDI=' } })
    const preview = await loadAiArtifact(artifactRequest)
    expect(preview.url).toBe('blob:fixture'); expect(create).toHaveBeenCalledOnce()
    preview.dispose(); expect(revoke).toHaveBeenCalledWith('blob:fixture')
    reply({ ...response(), data: { name: '../answer.txt', mimeType: 'text/plain', base64: 'NDI=' } })
    await expect(loadAiArtifact(artifactRequest)).rejects.toThrow('无效')
  })
  it('allows empty text artifacts while rejecting empty generated media', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:empty-text')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const artifactRequest = { ...request, operation: 'artifact' as const, payload: { artifactId: 'placeholder.txt' } }
    reply({ ...response(), data: { name: 'placeholder.txt', mimeType: 'text/plain', base64: '' } })
    const preview = await loadAiArtifact(artifactRequest)
    expect(preview.name).toBe('placeholder.txt')
    expect(create.mock.calls[0]?.[0]).toMatchObject({ size: 0, type: 'text/plain' })
    preview.dispose()
    reply({ ...response(), data: { name: 'clip.mp4', mimeType: 'video/mp4', base64: '' } })
    await expect(loadAiArtifact(artifactRequest)).rejects.toThrow('为空')
  })
})
