<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { AiRequest } from '../../../../contracts'
import { AiRequestNotSentError, aiRequest, getAiProjectId, getAiRequestId, readAiTextFiles, saveAiArtifact, saveTextFile } from '../../../../platform/desktop'
import { useAgentSession } from '../domain/session'
import { AgentWorkspaceView } from '../ui'
import '../ui/workspace.css'
const session = useAgentSession()
session.initialize(getAiProjectId('agent'), getAiRequestId())
const artifactBusy = ref(false)
let active = false, timer: ReturnType<typeof setTimeout> | undefined, polling = false
const status = computed(() => session.pending ? '启动中' : session.unconfirmed ? '启动状态待确认' : session.job ? ({ running: '运行中', succeeded: '已完成', failed: '失败', cancelled: '已取消' }[session.job.status]) : session.configured ? '就绪' : session.inspecting ? '连接中' : '未连接')
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
async function attach(files: File[]) {
  try { const incoming = await readAiTextFiles(files); session.error = session.addFiles(incoming) }
  catch (cause) { session.error = cause instanceof Error ? cause.message : '附件读取失败' }
}
async function download(id: string) {
  if (artifactBusy.value || !session.job?.result?.artifacts.some(item => item.id === id)) return
  const request = session.request('artifact'); request.payload = { artifactId: id }
  artifactBusy.value = true
  try { await saveAiArtifact(request) }
  catch (cause) { if (session.job?.jobId === request.jobId) session.error = cause instanceof Error ? cause.message : '结果文件保存失败' }
  finally { artifactBusy.value = false }
}
async function exportAnswer() {
  const text = session.job?.result?.text
  if (!text) return
  try { await saveTextFile('agent-result.md', text, 'text/markdown') }
  catch (cause) { session.error = cause instanceof Error ? cause.message : '结果保存失败' }
}
onMounted(() => { active = true; void runRequest('inspect'); schedule() })
onUnmounted(() => { active = false; if (timer) clearTimeout(timer) })
</script>
<template>
  <AgentWorkspaceView :prompt="session.prompt" :max-steps="session.maxSteps" :files="session.files.map(file => ({ name: file.name, size: file.content.length }))" :configured="session.configured" :inspecting="session.inspecting" :model="session.model" :tools="session.tools" :locked="session.locked" :pending="session.pending" :unconfirmed="session.unconfirmed" :status="status" :error="session.error" :connection-error="session.connectionError" :events="session.job?.events.map(event => event.message) ?? []" :answer="session.job?.result?.text ?? ''" :artifacts="session.job?.result?.artifacts ?? []" :artifact-busy="artifactBusy"
    @prompt="session.setPrompt" @max-steps="session.setMaxSteps" @files="attach" @remove-file="session.removeFile" @inspect="runRequest('inspect')" @run="start" @recover="session.unconfirmed && runRequest('start')" @cancel="cancel" @download="download" @export-answer="exportAnswer" />
</template>
