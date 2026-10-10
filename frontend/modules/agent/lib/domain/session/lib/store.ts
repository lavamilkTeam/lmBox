import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AiJob, AiRequest, AiResponse } from '../../../../../../contracts'

export const useAgentSession = defineStore('agent-session', () => {
  const projectId = ref(''), revision = ref(0), prompt = ref(''), maxSteps = ref(8)
  const files = ref<Array<{ name: string; content: string }>>([])
  const configured = ref(false), inspecting = ref(false), model = ref(''), tools = ref<string[]>([])
  const pending = ref(false), unconfirmed = ref(false), job = ref<AiJob | null>(null), error = ref(''), connectionError = ref('')
  const locked = computed(() => pending.value || unconfirmed.value || job.value?.status === 'running')
  let sequence = 0, taskRequest = '', inspectRequest = ''
  let requestNamespace = '', startRequest: AiRequest | undefined
  function initialize(id: string, namespace = id) { if (!projectId.value) { projectId.value = id; requestNamespace = namespace } }
  function changed() { revision.value++; job.value = null; error.value = '' }
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
  function validate(): string {
    if (!prompt.value.trim()) return '请输入任务'
    if (prompt.value.length > 65536) return '任务文本不能超过 65536 字符'
    if (!Number.isInteger(maxSteps.value) || maxSteps.value < 1 || maxSteps.value > 32) return '步骤上限应为 1 至 32'
    return ''
  }
  function request(operation: AiRequest['operation']): AiRequest {
    const request: AiRequest = operation === 'start' && startRequest ? startRequest : { schemaVersion: 1, projectId: projectId.value, requestId: `${requestNamespace}-${++sequence}`, inputRevision: operation === 'start' || operation === 'inspect' ? revision.value : job.value?.inputRevision ?? revision.value, capability: 'agent', operation }
    if (operation === 'inspect') { inspectRequest = request.requestId; inspecting.value = true }
    else { taskRequest = request.requestId; if (operation === 'start') { pending.value = true; unconfirmed.value = false; error.value = ''; job.value = null } }
    if (operation === 'start' && !startRequest) { request.payload = { prompt: prompt.value, maxSteps: maxSteps.value, files: files.value.map(file => ({ ...file })) }; startRequest = request }
    if (operation !== 'start' && operation !== 'inspect' && job.value) request.jobId = job.value.jobId
    return request
  }
  function current(request: AiRequest) {
    return request.projectId === projectId.value && (request.operation === 'inspect' ? request.requestId === inspectRequest : request.requestId === taskRequest && request.inputRevision === (job.value?.inputRevision ?? revision.value))
  }
  function accept(request: AiRequest, response: AiResponse) {
    if (!current(request) || response.schemaVersion !== 1 || response.requestId !== request.requestId || response.projectId !== request.projectId || response.inputRevision !== request.inputRevision || response.capability !== 'agent') return false
    if (request.operation === 'inspect') {
      inspecting.value = false; configured.value = response.ok && response.data?.configured === true
      connectionError.value = response.ok ? (configured.value ? '' : 'Agent 未就绪，请检查模型配置') : response.error?.message ?? 'Agent 状态读取失败'
      if (response.ok) { model.value = response.data?.model ?? ''; tools.value = response.data?.tools ?? [] }
    } else {
      if (!response.ok) { pending.value = false; unconfirmed.value = false; startRequest = undefined; error.value = response.error?.message ?? '任务请求失败'; return true }
      const next = response.data?.job
      if (!next || next.capability !== 'agent' || next.inputRevision !== request.inputRevision || (request.jobId && next.jobId !== request.jobId)) return false
      pending.value = false; unconfirmed.value = false; startRequest = undefined
      job.value = next; error.value = next.error?.message ?? ''
    }
    return true
  }
  function fail(request: AiRequest, message: string, notSent = false) {
    if (!current(request)) return
    if (request.operation === 'inspect') { inspecting.value = false; configured.value = false; connectionError.value = message }
    else {
      pending.value = false
      if (request.operation === 'start') { unconfirmed.value = !notSent; if (notSent) startRequest = undefined }
      error.value = message
    }
  }
  return { projectId, revision, prompt, maxSteps, files, configured, inspecting, model, tools, pending, unconfirmed, job, error, connectionError, locked, initialize, setPrompt, setMaxSteps, addFiles, removeFile, validate, request, accept, fail }
})
