import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { AiJob, AiNodeDefinition, AiRequest, AiResponse, AiValue, AiWorkflowNode } from '../../../../../../contracts'
import { defaultInput, exportWorkflow, isCredentialField, isLink, parseWorkflow, validateGraph } from './graph'

export const useVideoWorkflow = defineStore('video-workflow', () => {
  const projectId = ref(''), revision = ref(0), nodes = shallowRef<AiWorkflowNode[]>([])
  const definitions = shallowRef<AiNodeDefinition[]>([]), configured = ref(false), inspecting = ref(false)
  const job = ref<AiJob | null>(null), pending = ref(false), unconfirmed = ref(false), error = ref(''), connectionError = ref('')
  const locked = computed(() => pending.value || unconfirmed.value || job.value?.status === 'running')
  let sequence = 0, nextNode = 1, taskRequest = '', inspectRequest = ''
  let requestNamespace = '', startRequest: AiRequest | undefined
  function initialize(id: string, namespace = id) { if (!projectId.value) { projectId.value = id; requestNamespace = namespace } }
  function changed() { nodes.value = [...nodes.value]; revision.value++; job.value = null; error.value = '' }
  function add(type: string, x: number, y: number) {
    if (locked.value || !Number.isFinite(x) || !Number.isFinite(y)) return
    const definition = definitions.value.find(item => item.type === type)
    if (!definition) return
    while (nodes.value.some(node => node.id === String(nextNode))) nextNode++
    const node: AiWorkflowNode = { id: String(nextNode++), type, x: Math.max(16, x), y: Math.max(16, y), inputs: Object.create(null) }
    for (const input of definition.inputs) { if (isCredentialField(input.name)) continue; const value = defaultInput(input); if (value !== undefined) node.inputs[input.name] = value }
    nodes.value.push(node); changed(); return node.id
  }
  function move(id: string, x: number, y: number) {
    const node = nodes.value.find(item => item.id === id)
    if (node && Number.isFinite(x) && Number.isFinite(y)) { node.x = Math.max(16, x); node.y = Math.max(16, y); nodes.value = [...nodes.value] }
  }
  function remove(id: string) {
    if (locked.value) return
    nodes.value = nodes.value.filter(node => node.id !== id)
    for (const node of nodes.value) for (const [name, value] of Object.entries(node.inputs)) if (isLink(value) && value.nodeId === id) delete node.inputs[name]
    changed()
  }
  function setInput(id: string, name: string, value: AiValue | undefined) {
    if (locked.value || isCredentialField(name)) return
    const node = nodes.value.find(item => item.id === id)
    if (!node) return
    const input = definitions.value.find(item => item.type === node.type)?.inputs.find(item => item.name === name)
    if (input?.type === 'COMFY_DYNAMICCOMBO_V3' && node.inputs[name] !== value) {
      for (const key of Object.keys(node.inputs)) if (key.startsWith(`${name}.`)) delete node.inputs[key]
    }
    if (value === undefined) delete node.inputs[name]
    else node.inputs[name] = value
    changed()
  }
  function connect(source: string, outputIndex: number, target: string, name: string): string {
    if (locked.value) return '任务运行中，暂不能修改工作流'
    const node = nodes.value.find(item => item.id === target)
    if (!node || !nodes.value.some(item => item.id === source)) return '节点不存在'
    if (!Number.isInteger(outputIndex) || outputIndex < 0) return '输出端无效'
    const old = node.inputs[name]
    node.inputs[name] = { nodeId: source, outputIndex }
    const issue = validateGraph(nodes.value, definitions.value)
    if (issue) { if (old === undefined) delete node.inputs[name]; else node.inputs[name] = old; return issue }
    changed(); return ''
  }
  function importDocument(value: unknown): string {
    if (locked.value) return '请先结束当前任务'
    try { const workflow = parseWorkflow(value); nodes.value = workflow.nodes; changed(); return '' } catch (cause) { return cause instanceof Error ? cause.message : '工作流导入失败' }
  }
  function exportDocument(api = false) { return exportWorkflow(nodes.value, api) }
  function validate() { return validateGraph(nodes.value, definitions.value, true) }
  function request(operation: AiRequest['operation']): AiRequest {
    const request: AiRequest = operation === 'start' && startRequest ? startRequest : { schemaVersion: 1, projectId: projectId.value, requestId: `${requestNamespace}-${++sequence}`, inputRevision: operation === 'start' || operation === 'inspect' ? revision.value : job.value?.inputRevision ?? revision.value, capability: 'video', operation }
    if (operation === 'inspect') { inspectRequest = request.requestId; inspecting.value = true }
    else { taskRequest = request.requestId; if (operation === 'start') { pending.value = true; unconfirmed.value = false; error.value = ''; job.value = null } }
    if (operation === 'start' && !startRequest) { request.payload = { workflow: JSON.parse(exportWorkflow(nodes.value, false)).workflow }; startRequest = request }
    if (operation !== 'start' && operation !== 'inspect' && job.value) request.jobId = job.value.jobId
    return request
  }
  function current(request: AiRequest) {
    return request.projectId === projectId.value && (request.operation === 'inspect' ? request.requestId === inspectRequest : request.requestId === taskRequest && request.inputRevision === (job.value?.inputRevision ?? revision.value))
  }
  function accept(request: AiRequest, response: AiResponse) {
    if (!current(request) || response.requestId !== request.requestId || response.projectId !== request.projectId || response.inputRevision !== request.inputRevision || response.capability !== 'video' || response.schemaVersion !== 1) return false
    if (request.operation === 'inspect') {
      inspecting.value = false
      configured.value = response.ok && response.data?.configured === true
      connectionError.value = response.ok ? (configured.value ? '' : '视频后端未就绪，请检查 ComfyUI 连接') : response.error?.message ?? '节点目录读取失败'
      if (response.ok) definitions.value = response.data?.nodes ?? []
    } else {
      if (!response.ok) { pending.value = false; unconfirmed.value = false; startRequest = undefined; error.value = response.error?.message ?? '任务请求失败'; return true }
      const next = response.data?.job
      if (!next || next.capability !== 'video' || next.inputRevision !== request.inputRevision || (request.jobId && next.jobId !== request.jobId)) return false
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
  return { projectId, revision, nodes, definitions, configured, inspecting, job, pending, unconfirmed, error, connectionError, locked, initialize, add, move, remove, setInput, connect, importDocument, exportDocument, validate, request, accept, fail }
})
