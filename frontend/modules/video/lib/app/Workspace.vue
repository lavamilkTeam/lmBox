<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { AiRequest, AiValue } from '../../../../contracts'
import { AiRequestNotSentError, aiRequest, getAiProjectId, getAiRequestId, loadAiArtifact, readAiWorkflowFile, saveAiArtifact, saveTextFile } from '../../../../platform/desktop'
import { useVideoWorkflow, isCredentialField, isDynamicInput } from '../domain/workflow'
import { VideoEditor } from '../ui'
import type { VideoNode } from '../ui'
import '../ui/workspace.css'
const session = useVideoWorkflow()
session.initialize(getAiProjectId('video'), getAiRequestId())
const artifactBusy = ref(false), preview = ref<{ id: string; url: string; dispose: () => void } | null>(null)
let active = false, timer: ReturnType<typeof setTimeout> | undefined, polling = false, artifactGeneration = 0
const nodes = computed<VideoNode[]>(() => session.nodes.map(node => {
  const definition = session.definitions.find(item => item.type === node.type)
  const inputs = [...definition?.inputs ?? [], ...Object.keys(node.inputs).filter(name => !definition?.inputs.some(input => input.name === name)).map(name => ({ name, type: isDynamicInput(definition, name) ? 'DYNAMIC' : 'UNKNOWN', required: false }))]
  return { ...node, title: definition?.title ?? node.type, outputs: definition?.outputs ?? [], inputs: inputs.map(input => {
    const value = node.inputs[input.name]
    const connection = value && typeof value === 'object' && !Array.isArray(value) && typeof value.nodeId === 'string' && typeof value.outputIndex === 'number' ? { nodeId: value.nodeId, outputIndex: value.outputIndex } : undefined
    return { ...input, secret: isCredentialField(input.name), value, connection }
  }) }
}))
const status = computed(() => session.pending ? '启动中' : session.unconfirmed ? '启动状态待确认' : session.job ? ({ running: '运行中', succeeded: '已完成', failed: '失败', cancelled: '已取消' }[session.job.status]) : session.configured ? '就绪' : session.inspecting ? '连接中' : '未连接')
const artifacts = computed(() => (session.job?.result?.artifacts ?? []).map(artifact => ({ ...artifact, url: preview.value?.id === artifact.id ? preview.value.url : undefined })))
function releasePreview() { artifactGeneration++; preview.value?.dispose(); preview.value = null }
watch(() => session.job?.jobId, releasePreview)
watch(() => session.job?.status, () => schedule())
function schedule() {
  if (!active || timer || polling || session.job?.status !== 'running') return
  timer = setTimeout(async () => { timer = undefined; polling = true; await runRequest('status'); polling = false; schedule() }, 1200)
}
async function runRequest(operation: AiRequest['operation']) {
  const request = session.request(operation)
  try { session.accept(request, await aiRequest(request)) }
  catch (cause) { session.fail(request, cause instanceof Error ? cause.message : '请求失败', cause instanceof AiRequestNotSentError) }
  finally { schedule() }
}
async function start() {
  if (session.locked) return
  const error = session.validate()
  if (error) { session.error = error; return }
  await runRequest('start')
}
async function cancel() { if (session.job?.status === 'running') await runRequest('cancel') }
function connect(source: string, output: number, target: string, name: string) { session.error = session.connect(source, output, target, name) }
function setInput(id: string, name: string, value: unknown) { session.setInput(id, name, value as AiValue | undefined) }
async function importFile(file: File) {
  try { const value = await readAiWorkflowFile(file); session.error = session.importDocument(value) }
  catch (cause) { session.error = cause instanceof Error ? cause.message : '导入失败' }
}
async function exportFile(api: boolean) {
  try { await saveTextFile(api ? 'video-api.json' : 'video-workflow.json', session.exportDocument(api), 'application/json') }
  catch (cause) { session.error = cause instanceof Error ? cause.message : '保存失败' }
}
async function artifact(id: string, download: boolean) {
  if (artifactBusy.value || !session.job?.result?.artifacts.some(item => item.id === id)) return
  const request = session.request('artifact'); request.payload = { artifactId: id }
  const generation = artifactGeneration
  artifactBusy.value = true
  try {
    if (download) await saveAiArtifact(request)
    else {
      const loaded = await loadAiArtifact(request)
      if (!active || generation !== artifactGeneration) { loaded.dispose(); return }
      preview.value?.dispose(); preview.value = { id, url: loaded.url, dispose: loaded.dispose }
    }
  } catch (cause) { if (generation === artifactGeneration) session.error = cause instanceof Error ? cause.message : '产物读取失败' }
  finally { artifactBusy.value = false }
}
onMounted(() => { active = true; void runRequest('inspect'); schedule() })
onUnmounted(() => { active = false; if (timer) clearTimeout(timer); releasePreview() })
</script>
<template>
  <VideoEditor :nodes="nodes" :catalog="session.definitions" :configured="session.configured" :inspecting="session.inspecting" :locked="session.locked" :pending="session.pending" :unconfirmed="session.unconfirmed" :status="status" :error="session.error" :connection-error="session.connectionError" :events="session.job?.events.map(event => event.message) ?? []" :artifacts="artifacts" :artifact-busy="artifactBusy"
    @inspect="runRequest('inspect')" @add="session.add" @move="session.move" @remove="session.remove" @connect="connect" @input="setInput" @import="importFile" @export="exportFile" @run="start" @recover="session.unconfirmed && runRequest('start')" @cancel="cancel" @preview="artifact($event, false)" @download="artifact($event, true)" />
</template>
