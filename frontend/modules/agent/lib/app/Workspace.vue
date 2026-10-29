<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { AiRequest } from '../../../../contracts'
import { AiRequestNotSentError, aiRequest, getAiRequestId, readAiTextFiles, saveAiArtifact, saveTextFile } from '../../../../platform/desktop'
import { useChatHistory } from '../features/chat-history'
import { AgentPanel, AgentWorkspaceView, ChatHistoryLayout } from '../ui'
import type { AgentTurnView } from '../ui'
import '../ui/workspace.css'
withDefaults(defineProps<{ sidebar?: boolean }>(), { sidebar: false })
const emit = defineEmits<{ expand: [] }>()
const history = useChatHistory()
history.initialize(getAiRequestId())
const session = computed(() => history.session!)
const artifactBusy = ref(false), attaching = ref(false)
let active = false, timer: ReturnType<typeof setTimeout> | undefined, polling = false, conversationGeneration = 0
const turns = computed<AgentTurnView[]>(() => session.value.turns.map(turn => ({
  id: turn.id, prompt: turn.prompt, files: turn.files,
  status: turn.submission === 'sent' ? turn.job!.status : turn.submission,
  events: turn.job?.events.map(event => event.message) ?? [], answer: turn.job?.result?.text ?? '',
  error: turn.error, artifacts: turn.job?.result?.artifacts ?? [],
})))
watch(() => session.value.job?.status, () => schedule())
function schedule() {
  if (!active || timer || polling || session.value.job?.status !== 'running') return
  timer = setTimeout(async () => {
    timer = undefined
    if (!active || session.value.job?.status !== 'running') return
    polling = true; await runRequest('status'); polling = false; schedule()
  }, 1200)
}
async function runRequest(operation: Exclude<AiRequest['operation'], 'artifact'>) {
  const target = session.value
  const request = target.request(operation)
  try { target.accept(request, await aiRequest(request)) }
  catch (cause) { target.fail(request, cause instanceof Error ? cause.message : '请求失败', cause instanceof AiRequestNotSentError) }
  finally { schedule() }
}
async function start() {
  if (session.value.locked || attaching.value) return
  const error = session.value.validate()
  if (error) { session.value.error = error; return }
  await runRequest('start')
}
async function cancel() { if (session.value.job?.status === 'running') await runRequest('cancel') }
async function attach(files: File[]) {
  if (session.value.locked || attaching.value) return
  attaching.value = true
  const generation = conversationGeneration
  try { const incoming = await readAiTextFiles(files); if (active && generation === conversationGeneration) session.value.error = session.value.addFiles(incoming) }
  catch (cause) { if (active && generation === conversationGeneration) session.value.error = cause instanceof Error ? cause.message : '附件读取失败' }
  finally { attaching.value = false }
}
function newConversation() {
  if (session.value.locked || attaching.value) return
  if (history.create(getAiRequestId())) { conversationGeneration++; void runRequest('inspect') }
}
function selectConversation(id: string) {
  if (attaching.value) return
  if (history.select(id)) { conversationGeneration++; void runRequest('inspect') }
}
async function download(turnId: string, id: string) {
  if (artifactBusy.value) return
  const request = session.value.artifactRequest(turnId, id)
  if (!request) return
  artifactBusy.value = true
  try { await saveAiArtifact(request) }
  catch (cause) { if (session.value.turns.some(turn => turn.id === turnId)) session.value.error = cause instanceof Error ? cause.message : '结果文件保存失败' }
  finally { artifactBusy.value = false }
}
async function exportAnswer(turnId: string) {
  const text = session.value.answer(turnId)
  if (!text) return
  try { await saveTextFile('agent-result.md', text, 'text/markdown') }
  catch (cause) { if (session.value.turns.some(turn => turn.id === turnId)) session.value.error = cause instanceof Error ? cause.message : '结果保存失败' }
}
onMounted(() => { active = true; void runRequest('inspect'); schedule() })
onUnmounted(() => { active = false; if (timer) clearTimeout(timer) })
</script>
<template>
  <AgentPanel :sidebar="sidebar" @expand="emit('expand')">
    <ChatHistoryLayout :compact="sidebar" :items="history.items" :active-id="history.activeId" :query="history.query" :busy="session.locked || attaching" @select="selectConversation" @new-chat="newConversation" @query="history.setQuery">
    <AgentWorkspaceView :key="history.activeId" :prompt="session.prompt" :max-steps="session.maxSteps" :files="session.files.map(file => ({ name: file.name, size: file.content.length }))" :configured="session.configured" :inspecting="session.inspecting" :model="session.model" :tools="session.tools" :locked="session.locked" :pending="session.pending" :unconfirmed="session.unconfirmed" :error="session.error" :connection-error="session.connectionError" :turns="turns" :artifact-busy="artifactBusy"
      :attaching="attaching" @prompt="session.setPrompt" @max-steps="session.setMaxSteps" @files="attach" @remove-file="session.removeFile" @inspect="runRequest('inspect')" @run="start" @recover="session.unconfirmed && runRequest('start')" @cancel="cancel" @new-conversation="newConversation" @download="download" @export-answer="exportAnswer" />
    </ChatHistoryLayout>
  </AgentPanel>
</template>
