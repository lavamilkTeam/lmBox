import { computed, ref } from 'vue'
import { defineStore, type Pinia } from 'pinia'
import type { AiJob, AiRequest, AiResponse } from '../../../../../../contracts'

interface AgentTurn {
  id: string
  inputRevision: number
  prompt: string
  files: Array<{ name: string; size: number }>
  submission: 'submitting' | 'unconfirmed' | 'sent' | 'failed'
  job: AiJob | null
  error: string
}

function createSessionState() {
  const projectId = ref(''), revision = ref(0), prompt = ref(''), maxSteps = ref(8)
  const files = ref<Array<{ name: string; content: string }>>([])
  const configured = ref(false), inspecting = ref(false), model = ref(''), tools = ref<string[]>([])
  const turns = ref<AgentTurn[]>([]), activeTurnId = ref('')
  const activeTurn = computed(() => turns.value.find(turn => turn.id === activeTurnId.value))
  const job = computed(() => activeTurn.value?.job ?? null)
  const pending = computed(() => activeTurn.value?.submission === 'submitting')
  const unconfirmed = computed(() => activeTurn.value?.submission === 'unconfirmed')
  const error = ref(''), connectionError = ref('')
  const locked = computed(() => pending.value || unconfirmed.value || job.value?.status === 'running')
  const completedCount = computed(() => turns.value.filter(turn => turn.job?.status === 'succeeded').length)
  const parentJobId = computed(() => [...turns.value].reverse().find(turn => turn.job?.status === 'succeeded')?.job?.jobId)
  let sequence = 0, taskRequest = '', inspectRequest = ''
  let requestNamespace = '', startRequest: AiRequest | undefined
  function initialize(id: string, namespace = id) { if (!projectId.value) { projectId.value = id; requestNamespace = namespace } }
  function changed() { revision.value++; error.value = '' }
  function setPrompt(value: string) { if (!locked.value) { prompt.value = value; changed() } }
  function setMaxSteps(value: number) { if (!locked.value) { maxSteps.value = value; changed() } }
  function addFiles(incoming: Array<{ name: string; content: string }>): string {
    if (locked.value) return '请先结束当前任务'
    if (files.value.length + incoming.length > 16) return '最多添加 16 个文本文件'
    const names = new Set(files.value.map(file => file.name))
    for (const file of incoming) {
      if (!/^[\p{L}\p{N}_][\p{L}\p{N}_ .-]*$/u.test(file.name) || [...file.name].length > 128 || file.name.includes('..') || /[ .]$/.test(file.name)) return '附件名称无效'
      if (names.has(file.name)) return `已存在同名附件：${file.name}`
      names.add(file.name)
    }
    if ([...files.value, ...incoming].reduce((length, file) => length + new TextEncoder().encode(file.content).length, 0) > 1024 * 1024) return '附件总大小不能超过 1 MB'
    files.value.push(...incoming); changed(); return ''
  }
  function removeFile(index: number) { if (!locked.value && files.value[index]) { files.value.splice(index, 1); changed() } }
  function newConversation() {
    if (locked.value) return
    turns.value = []; activeTurnId.value = ''; prompt.value = ''; files.value = []
    startRequest = undefined; taskRequest = ''; changed()
  }
  function validate(): string {
    if (completedCount.value >= 20) return '当前对话已完成 20 轮，请新建对话后继续'
    if (!prompt.value.trim()) return '请输入任务'
    if (prompt.value.length > 65536) return '任务文本不能超过 65536 字符'
    if (!Number.isInteger(maxSteps.value) || maxSteps.value < 1 || maxSteps.value > 32) return '步骤上限应为 1 至 32'
    return ''
  }
  function envelope(operation: AiRequest['operation'], inputRevision: number): AiRequest {
    return { schemaVersion: 1, projectId: projectId.value, requestId: `${requestNamespace}-${++sequence}`, inputRevision, capability: 'agent', operation }
  }
  function request(operation: Exclude<AiRequest['operation'], 'artifact'>): AiRequest {
    const request = operation === 'start' && startRequest ? startRequest : envelope(operation, operation === 'start' || operation === 'inspect' ? revision.value : job.value?.inputRevision ?? revision.value)
    if (operation === 'inspect') { inspectRequest = request.requestId; inspecting.value = true; return request }
    taskRequest = request.requestId
    if (operation === 'start') {
      error.value = ''
      if (!startRequest) {
        const parent = parentJobId.value
        request.payload = { prompt: prompt.value, maxSteps: maxSteps.value, files: files.value.map(file => ({ ...file })), ...(parent ? { parentJobId: parent } : {}) }
        startRequest = request
        const turn: AgentTurn = { id: request.requestId, inputRevision: request.inputRevision, prompt: prompt.value, files: files.value.map(file => ({ name: file.name, size: file.content.length })), submission: 'submitting', job: null, error: '' }
        turns.value.push(turn); activeTurnId.value = turn.id
      } else if (activeTurn.value) {
        activeTurn.value.submission = 'submitting'; activeTurn.value.error = ''
      }
    } else if (job.value) request.jobId = job.value.jobId
    return request
  }
  /** Historical downloads must never replace the active task request or revision. */
  function artifactRequest(turnId: string, artifactId: string): AiRequest | undefined {
    const turn = turns.value.find(item => item.id === turnId)
    const source = turn?.job
    if (!source?.result?.artifacts.some(artifact => artifact.id === artifactId)) return
    return { ...envelope('artifact', source.inputRevision), jobId: source.jobId, payload: { artifactId } }
  }
  function answer(turnId: string) { return turns.value.find(turn => turn.id === turnId)?.job?.result?.text ?? '' }
  function current(request: AiRequest) {
    return request.projectId === projectId.value && (request.operation === 'inspect'
      ? request.requestId === inspectRequest
      : request.requestId === taskRequest && request.inputRevision === activeTurn.value?.inputRevision)
  }
  function accept(request: AiRequest, response: AiResponse) {
    if (!current(request) || response.schemaVersion !== 1 || response.requestId !== request.requestId || response.projectId !== request.projectId || response.inputRevision !== request.inputRevision || response.capability !== 'agent') return false
    if (request.operation === 'inspect') {
      inspecting.value = false; configured.value = response.ok && response.data?.configured === true
      connectionError.value = response.ok ? (configured.value ? '' : 'Agent 未就绪，请检查模型配置') : response.error?.message ?? 'Agent 状态读取失败'
      if (response.ok) { model.value = response.data?.model ?? ''; tools.value = response.data?.tools ?? [] }
      return true
    }
    const turn = activeTurn.value!
    if (!response.ok) {
      error.value = response.error?.message ?? '任务请求失败'; turn.error = error.value
      if (request.operation === 'start') { turn.submission = 'failed'; startRequest = undefined }
      return true
    }
    const next = response.data?.job
    if (!next || next.capability !== 'agent' || next.inputRevision !== request.inputRevision || (request.jobId && next.jobId !== request.jobId)) return false
    if (turn.job && (next.jobId !== turn.job.jobId || turn.job.status !== 'running' && next.status !== turn.job.status)) return false
    if (request.operation === 'start' && turn.submission !== 'sent') {
      prompt.value = ''; files.value = []; revision.value++
    }
    turn.submission = 'sent'; turn.job = next; turn.error = next.error?.message ?? ''
    startRequest = undefined; error.value = turn.error
    return true
  }
  function fail(request: AiRequest, message: string, notSent = false) {
    if (!current(request)) return
    if (request.operation === 'inspect') { inspecting.value = false; configured.value = false; connectionError.value = message; return }
    const turn = activeTurn.value!
    if (request.operation === 'start') { turn.submission = notSent ? 'failed' : 'unconfirmed'; if (notSent) startRequest = undefined }
    turn.error = message; error.value = message
  }
  return { projectId, revision, prompt, maxSteps, files, configured, inspecting, model, tools, turns, activeTurnId, pending, unconfirmed, job, error, connectionError, locked, completedCount, initialize, setPrompt, setMaxSteps, addFiles, removeFile, newConversation, validate, request, artifactRequest, answer, accept, fail }
}

/** Each chat owns its request sequence, draft and trusted task chain. */
export function useAgentSession(id = 'default', pinia?: Pinia) {
  return defineStore(`agent-session-${id}`, createSessionState)(pinia)
}
