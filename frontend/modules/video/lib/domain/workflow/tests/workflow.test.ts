import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AiJob, AiNodeDefinition, AiRequest, AiResponse } from '../../../../../../contracts'
import { useVideoWorkflow } from '../index'
const catalog: AiNodeDefinition[] = [
  { type: 'Text', title: 'Text', category: 'test', inputs: [{ name: 'text', type: 'STRING', required: true, default: '' }], outputs: [{ name: 'text', type: 'STRING' }] },
  { type: 'CloudVideo', title: 'Cloud video', category: 'test', inputs: [{ name: 'prompt', type: 'STRING', required: true }, { name: 'seed', type: 'INT', required: true, default: 7, min: 0, max: 100 }, { name: 'api_key', type: 'STRING', required: true }], outputs: [{ name: 'video', type: 'VIDEO' }] },
  { type: 'PassVideo', title: 'Pass', category: 'test', inputs: [{ name: 'video', type: 'VIDEO', required: true }], outputs: [{ name: 'video', type: 'VIDEO' }] },
]
function response(request: AiRequest, data: AiResponse['data']): AiResponse { return { schemaVersion: 1, projectId: request.projectId, requestId: request.requestId, inputRevision: request.inputRevision, capability: 'video', ok: true, data } }
function setup() {
  const flow = useVideoWorkflow(); flow.initialize('video-test')
  const inspect = flow.request('inspect'); flow.accept(inspect, response(inspect, { configured: true, nodes: catalog }))
  return flow
}
function job(request: AiRequest, status: AiJob['status'] = 'running'): AiJob { return { jobId: 'job-test', capability: 'video', inputRevision: request.inputRevision, status, events: [] } }
describe('video workflow public domain', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('validates ports and restores the old input after a rejected connection', () => {
    const flow = setup(), text = flow.add('Text', 0, 0)!, video = flow.add('CloudVideo', 300, 30)!, pass = flow.add('PassVideo', 600, 30)!
    expect(flow.nodes[0].x).toBe(16)
    expect(flow.connect(text, 0, video, 'prompt')).toBe('')
    expect(flow.connect(video, 0, pass, 'video')).toBe('')
    expect(flow.connect(video, 0, video, 'prompt')).toContain('不匹配')
    expect(flow.nodes[1].inputs.prompt).toEqual({ nodeId: text, outputIndex: 0 })
    expect(flow.connect(pass, 0, pass, 'video')).toContain('循环')
    expect(flow.connect(video, 4, pass, 'video')).toContain('不匹配')
    expect(flow.validate()).toBe('')
    flow.remove(video)
    expect(flow.nodes[1].inputs.video).toBeUndefined()
    expect(flow.validate()).toContain('缺少输入')
  })
  it('round trips ComfyUI API links and lmBox positions without inventing nodes', () => {
    const flow = setup()
    expect(flow.importDocument({ '9': { class_type: 'Text', inputs: { text: 'test' } }, '20': { class_type: 'CloudVideo', inputs: { prompt: ['9', 0], seed: 12 } } })).toBe('')
    expect(flow.nodes[1].inputs.prompt).toEqual({ nodeId: '9', outputIndex: 0 })
    flow.move('9', 511, 233)
    const document = JSON.parse(flow.exportDocument())
    expect(flow.importDocument(document)).toBe('')
    expect(flow.nodes[0]).toMatchObject({ x: 511, y: 233 })
    expect(JSON.parse(flow.exportDocument(true))['20'].inputs.prompt).toEqual(['9', 0])
    expect(flow.validate()).toBe('')
    const id = flow.add('Text', 50, 50)
    expect(flow.nodes.filter(node => node.id === id)).toHaveLength(1)
  })
  it('rejects broken and secret-bearing imports atomically and blocks credential editing', () => {
    const flow = setup(), id = flow.add('CloudVideo', 30, 30)!
    const before = flow.exportDocument()
    for (const source of [
      { '1': { class_type: 'CloudVideo', inputs: { prompt: ['missing', 0] } } },
      { '1': { class_type: 'CloudVideo', inputs: { api_key: 'do-not-persist' } } },
      { '1': { class_type: 'CloudVideo', inputs: { vendor_api_key: 'do-not-persist' } } },
      { nodes: [], links: [] },
      { format: 'lmbox-video-workflow', schemaVersion: 99, workflow: { nodes: [] } },
    ]) { expect(flow.importDocument(source)).not.toBe(''); expect(flow.exportDocument()).toBe(before) }
    flow.setInput(id, 'api_key', 'do-not-persist')
    expect(flow.exportDocument()).not.toContain('do-not-persist')
    expect(flow.nodes[0].inputs).not.toHaveProperty('api_key')
    flow.setInput(id, 'seed', 101)
    expect(flow.validate()).toContain('范围')
  })
  it('checks catalog availability after an offline import', () => {
    const flow = setup()
    expect(flow.importDocument({ '1': { class_type: 'MissingCloudNode', inputs: {} } })).toBe('')
    expect(flow.validate()).toContain('不可用')
    expect(flow.add('MissingCloudNode', 0, 0)).toBeUndefined()
  })
  it('keeps a running draft stable and rejects foreign or superseded status', () => {
    const flow = setup(), id = flow.add('CloudVideo', 30, 30)!
    const start = flow.request('start')
    flow.setInput(id, 'seed', 3)
    flow.remove(id)
    expect(flow.nodes[0].inputs.seed).toBe(7)
    expect(flow.accept(start, response(start, { job: job(start) }))).toBe(true)
    const oldPoll = flow.request('status'), cancel = flow.request('cancel')
    expect(flow.accept(cancel, response(cancel, { job: job(start, 'cancelled') }))).toBe(true)
    expect(flow.accept(oldPoll, response(oldPoll, { job: job(start) }))).toBe(false)
    expect(flow.job?.status).toBe('cancelled')
    const poll = flow.request('status')
    expect(flow.accept(poll, response(poll, { job: { ...job(start), jobId: 'other-job' } }))).toBe(false)
    expect(flow.job?.jobId).toBe('job-test')
    flow.setInput(id, 'seed', 9)
    expect(flow.job).toBeNull()
    expect(flow.accept(poll, response(poll, { job: job(start) }))).toBe(false)
    expect(flow.nodes[0].inputs.seed).toBe(9)
  })
  it('retains the job after a status transport failure so polling can resume', () => {
    const flow = setup(); flow.add('CloudVideo', 0, 0)
    const start = flow.request('start'); flow.accept(start, response(start, { job: job(start) }))
    const poll = flow.request('status'); flow.fail(poll, 'connection lost')
    expect(flow.locked).toBe(true)
    expect(flow.job?.jobId).toBe('job-test')
    const retry = flow.request('status'); flow.accept(retry, response(retry, { job: job(start, 'succeeded') }))
    expect(flow.locked).toBe(false)
    expect(flow.error).toBe('')
  })
  it('keeps an uncertain start immutable and replays its exact identity', () => {
    const flow = setup(), id = flow.add('CloudVideo', 0, 0)!
    const start = flow.request('start'); flow.fail(start, 'Response lost')
    expect(flow.pending).toBe(false); expect(flow.unconfirmed).toBe(true); expect(flow.locked).toBe(true)
    flow.setInput(id, 'seed', 55)
    expect(flow.nodes[0].inputs.seed).toBe(7)
    const retry = flow.request('start')
    expect(retry).toEqual(start)
    expect(flow.accept(retry, response(retry, { job: job(retry) }))).toBe(true)
    expect(flow.unconfirmed).toBe(false)
  })
  it('keeps literal scalar and vector values when importing and exporting API prompts', () => {
    const flow = setup()
    expect(flow.importDocument({ '1': { class_type: 'Unknown', inputs: { text: 'literal', integer: 3, float: 2.5, bool: false, vector: [1, 2, 3] } } })).toBe('')
    expect(JSON.parse(flow.exportDocument(true))['1'].inputs).toEqual({ text: 'literal', integer: 3, float: 2.5, bool: false, vector: [1, 2, 3] })
    const inspect = flow.request('inspect'); flow.accept(inspect, response(inspect, { configured: true, nodes: [] }))
    expect(flow.nodes[0].inputs.text).toBe('literal')
    expect(flow.validate()).toContain('不可用')
  })
  it('allows reducing a draft after the adapter rejects an unsent oversized request', () => {
    const flow = setup(), id = flow.add('CloudVideo', 0, 0)!
    const rejected = flow.request('start'); flow.fail(rejected, 'Request too large', true)
    expect(flow.pending).toBe(false); expect(flow.unconfirmed).toBe(false); expect(flow.locked).toBe(false)
    flow.setInput(id, 'prompt', 'Smaller prompt')
    const retry = flow.request('start')
    expect(retry.requestId).not.toBe(rejected.requestId)
    expect(retry.payload).not.toEqual(rejected.payload)
  })
  it('preserves V3 dynamic branch values and validates their graph references', () => {
    const flow = setup()
    const inspect = flow.request('inspect')
    const save: AiNodeDefinition = { type: 'SaveVideoV3', title: 'Save video', category: 'test', inputs: [
      { name: 'format', type: 'COMFY_DYNAMICCOMBO_V3', required: true, choices: ['mp4', 'webm'] },
      { name: 'preset', type: 'COMBO', required: true, choices: ['fast', 'quality'] },
    ], outputs: [] }
    flow.accept(inspect, response(inspect, { configured: true, nodes: [...catalog, save] }))
    expect(flow.importDocument({
      '1': { class_type: 'Text', inputs: { text: 'title' } },
      '2': { class_type: 'SaveVideoV3', inputs: { format: 'mp4', preset: 'quality', 'format.codec': 'h264', 'format.codec.encoding.crf': 21, 'format.description': ['1', 0] } },
    })).toBe('')
    expect(flow.validate()).toBe('')
    expect(JSON.parse(flow.exportDocument(true))['2'].inputs).toEqual({ format: 'mp4', preset: 'quality', 'format.codec': 'h264', 'format.codec.encoding.crf': 21, 'format.description': ['1', 0] })
    expect(flow.connect('1', 99, '2', 'format.description')).toContain('不匹配')
    flow.setInput('2', 'formatx.codec', 'h264'); expect(flow.validate()).toContain('不支持输入')
    flow.setInput('2', 'formatx.codec', undefined)
    flow.setInput('2', 'preset.codec', 'h264'); expect(flow.validate()).toContain('不支持输入')
    flow.setInput('2', 'preset.codec', undefined)
    flow.setInput('2', 'format.', 'invalid'); expect(flow.validate()).toContain('不支持输入')
    flow.setInput('2', 'format.', undefined)
    expect(flow.importDocument({ '2': { class_type: 'SaveVideoV3', inputs: { format: 'mp4', 'format.api_key': 'secret' } } })).toContain('凭据')
    flow.setInput('2', 'format', 'mp4')
    expect(flow.nodes[1].inputs['format.codec']).toBe('h264')
    flow.setInput('2', 'format', 'webm')
    expect(flow.nodes[1].inputs).toEqual({ format: 'webm', preset: 'quality' })
    expect(flow.validate()).toBe('')
  })
})
