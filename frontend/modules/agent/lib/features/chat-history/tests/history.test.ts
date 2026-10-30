import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AiRequest, AiResponse } from '../../../../../../contracts'
import { useChatHistory } from '..'

function done(request: AiRequest): AiResponse {
  return { schemaVersion: 1, projectId: request.projectId, requestId: request.requestId, inputRevision: request.inputRevision, capability: 'agent', ok: true,
    data: { job: { jobId: 'first-job', capability: 'agent', inputRevision: request.inputRevision, status: 'succeeded', events: [], result: { text: 'Saved answer', artifacts: [{ id: 'answer.txt', name: 'answer.txt', mimeType: 'text/plain' }] } } } }
}

describe('Agent chat history', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('preserves separate drafts, attachments and budgets across selection and remounts', () => {
    const history = useChatHistory()
    history.initialize('chat-one')
    history.session!.setPrompt('First draft')
    history.session!.setMaxSteps(3)
    history.session!.addFiles([{ name: 'first.txt', content: 'first file' }])
    expect(history.create('chat-two')).toBe(true)
    history.session!.setPrompt('Second draft')
    expect(history.session!.files).toEqual([])
    history.select('chat-one')
    expect(history.session!.prompt).toBe('First draft')
    expect(history.session!.maxSteps).toBe(3)
    expect(history.session!.files).toEqual([{ name: 'first.txt', content: 'first file' }])
    const remounted = useChatHistory()
    remounted.initialize('ignored')
    expect(remounted.activeId).toBe('chat-one')
    expect(remounted.items.map(item => item.title)).toEqual(['Second draft', 'First draft'])
    expect(history.select('missing')).toBe(false)
  })

  it('keeps task contexts and historical artifact identities with their original chat', () => {
    const history = useChatHistory()
    history.initialize('chat-one')
    const first = history.session!
    first.setPrompt('First prompt')
    const request = first.request('start')
    first.accept(request, done(request))
    history.create('chat-two')
    const second = history.session!
    second.setPrompt('Independent prompt')
    const other = second.request('start')
    expect(other.projectId).not.toBe(request.projectId)
    expect(other.payload).not.toHaveProperty('parentJobId')
    expect(second.accept(request, done(request))).toBe(false)
    second.fail(other, 'Not sent', true)
    history.select('chat-one')
    expect(history.session!.answer(request.requestId)).toBe('Saved answer')
    expect(history.session!.artifactRequest(request.requestId, 'answer.txt')).toMatchObject({ projectId: 'chat-one', jobId: 'first-job' })
    history.session!.setPrompt('Follow up')
    expect(history.session!.request('start').payload?.parentJobId).toBe('first-job')
  })

  it('does not switch or create while a start is pending or unconfirmed', () => {
    const history = useChatHistory()
    history.initialize('chat-one')
    history.session!.setPrompt('Draft')
    history.create('chat-two')
    history.session!.setPrompt('Run')
    const start = history.session!.request('start')
    expect(history.create('chat-three')).toBe(false)
    expect(history.select('chat-one')).toBe(false)
    history.session!.fail(start, 'Lost response')
    expect(history.items[0]!.status).toBe('状态待确认')
    expect(history.select('chat-one')).toBe(false)
    history.session!.accept(start, done(start))
    expect(history.select('chat-one')).toBe(true)
  })

  it('searches titles without deleting conversations and reuses an empty chat', () => {
    const history = useChatHistory()
    history.initialize('chat-one')
    expect(history.create('empty-duplicate')).toBe(false)
    history.session!.setPrompt('  Build\n a WEB app  ')
    history.create('chat-two')
    history.setQuery(' web ')
    expect(history.items.map(item => item.title)).toEqual(['Build a WEB app'])
    history.setQuery('missing')
    expect(history.items).toEqual([])
    history.setQuery('')
    expect(history.items).toHaveLength(2)
    expect(history.select('chat-one')).toBe(true)
  })

  it('a late connection response updates its source chat without replacing the selected one', () => {
    const history = useChatHistory()
    history.initialize('chat-one')
    const first = history.session!
    const inspect = first.request('inspect')
    first.setPrompt('Draft')
    history.create('chat-two')
    first.accept(inspect, { schemaVersion: 1, projectId: inspect.projectId, requestId: inspect.requestId, inputRevision: inspect.inputRevision, capability: 'agent', ok: true, data: { configured: true, model: 'fixture', tools: [] } })
    expect(first.configured).toBe(true)
    expect(history.activeId).toBe('chat-two')
    expect(history.session!.configured).toBe(false)
  })
})
