<script setup lang="ts">
import { computed, ref } from 'vue'
import { PaperclipIcon, Settings2Icon, XIcon } from '@lucide/vue'
import { Badge, Button, Input, Label } from '../../../../ui/shadcn'
import Conversation from './elements/Conversation.vue'
import ConversationContent from './elements/ConversationContent.vue'
import Message from './elements/Message.vue'
import MessageContent from './elements/MessageContent.vue'
import PromptInput from './elements/PromptInput.vue'
import PromptInputTextarea from './elements/PromptInputTextarea.vue'
import PromptInputSubmit from './elements/PromptInputSubmit.vue'
import Execution from './elements/Execution.vue'
import type { AgentFileView, AgentTurnView } from './types'

const props = defineProps<{
  prompt: string; maxSteps: number; files: AgentFileView[]; configured: boolean; inspecting: boolean; model: string; tools: string[]
  locked: boolean; pending: boolean; unconfirmed: boolean; status: string; error: string; connectionError: string
  turns: AgentTurnView[]; artifactBusy: boolean; attaching: boolean
}>()
const emit = defineEmits<{
  prompt: [value: string]; maxSteps: [value: number]; files: [files: File[]]; removeFile: [index: number]
  inspect: []; run: []; recover: []; cancel: []; newConversation: []
  download: [turnId: string, id: string]; exportAnswer: [turnId: string]
}>()
const fileInput = ref<HTMLInputElement>(), settingsOpen = ref(false)
const canSubmit = computed(() => props.configured && !props.locked && !props.attaching && !!props.prompt.trim())
const followKey = computed(() => props.turns.map(turn => `${turn.id}:${turn.status}:${turn.events.length}:${turn.answer.length}`).join('|'))
const latestError = computed(() => props.turns.at(-1)?.error)
const statusLabel: Record<AgentTurnView['status'], string> = {
  submitting: '启动中', unconfirmed: '启动状态待确认', running: '执行中', succeeded: '已完成', failed: '失败', cancelled: '已取消',
}
function attach(event: Event) {
  const input = event.target as HTMLInputElement, files = Array.from(input.files ?? [])
  if (files.length) emit('files', files)
  input.value = ''
}
function submit() { if (canSubmit.value) emit('run') }
</script>
<template>
  <main class="agent-workspace" aria-label="AI 工作助手">
    <header class="agent-toolbar">
      <strong>AI 工作助手</strong><Badge variant="outline">{{ status }}</Badge>
      <div class="agent-toolbar-actions">
        <Button variant="ghost" size="sm" :disabled="locked || !turns.length && !prompt && !files.length" @click="emit('newConversation')">新对话</Button>
        <Button variant="outline" size="sm" :disabled="inspecting" @click="emit('inspect')">{{ inspecting ? '连接中' : '刷新连接' }}</Button>
        <Button variant="ghost" size="icon-sm" aria-label="对话设置" :aria-expanded="settingsOpen" aria-controls="agent-settings" @click="settingsOpen = !settingsOpen"><Settings2Icon :size="16" /></Button>
      </div>
    </header>
    <div v-if="connectionError" class="agent-error" role="alert">{{ connectionError }}</div>
    <div v-if="error && error !== latestError" class="agent-error" role="alert">{{ error }}</div>
    <div class="agent-content" :class="{ 'agent-with-settings': settingsOpen }">
      <section class="agent-chat" :class="{ 'agent-chat-empty': !turns.length }" aria-label="Agent 执行结果">
        <Conversation v-if="turns.length" :follow-key="followKey">
          <ConversationContent class="agent-conversation-content">
            <article v-for="(turn, index) in turns" :key="turn.id" class="agent-turn" :aria-label="`第 ${index + 1} 轮对话`">
              <Message from="user" class="agent-user-message">
                <MessageContent>
                  <p class="agent-message-text">{{ turn.prompt }}</p>
                  <ul v-if="turn.files.length" class="agent-sent-files" aria-label="本轮附件"><li v-for="file in turn.files" :key="file.name"><Badge variant="outline" :title="`${file.size} 字符`">{{ file.name }}</Badge></li></ul>
                </MessageContent>
              </Message>
              <Message from="assistant" class="agent-assistant-message">
                <MessageContent class="agent-assistant-content">
                  <div class="agent-message-heading"><strong>助手</strong><Badge v-if="turn.status !== 'succeeded'" variant="outline">{{ statusLabel[turn.status] }}</Badge></div>
                  <Execution v-if="turn.events.length" :events="turn.events" :running="turn.status === 'running'" />
                  <p v-if="turn.answer" class="agent-message-text" :aria-label="`助手回复 ${index + 1}`">{{ turn.answer }}</p>
                  <p v-if="turn.error" class="agent-message-error" role="alert">{{ turn.error }}</p>
                  <section v-if="turn.artifacts.length" class="agent-artifacts" aria-label="Agent 结果文件">
                    <div v-for="artifact in turn.artifacts" :key="artifact.id" class="agent-artifact">
                      <span>{{ artifact.name }}</span><Button variant="outline" size="sm" :disabled="artifactBusy" :aria-label="`下载 ${artifact.name}`" @click="emit('download', turn.id, artifact.id)">下载</Button>
                    </div>
                  </section>
                  <div v-if="turn.answer" class="agent-message-actions"><Button variant="ghost" size="sm" @click="emit('exportAnswer', turn.id)">保存结果</Button></div>
                </MessageContent>
              </Message>
            </article>
          </ConversationContent>
        </Conversation>
        <div class="agent-composer-area">
          <PromptInput @submit="submit">
            <ul v-if="files.length" class="agent-files" aria-label="待发送附件"><li v-for="(file, index) in files" :key="file.name"><span>{{ file.name }}</span><Button type="button" variant="ghost" size="icon-sm" :disabled="locked" :aria-label="`移除附件 ${file.name}`" @click="emit('removeFile', index)"><XIcon :size="13" /></Button></li></ul>
            <PromptInputTextarea :model-value="prompt" :disabled="locked" :can-submit="canSubmit" @update:model-value="emit('prompt', $event)" />
            <div class="agent-composer-controls">
              <Button type="button" variant="ghost" size="icon-sm" :disabled="locked || attaching" aria-label="添加文本文件" @click="fileInput?.click()"><PaperclipIcon :size="17" /></Button>
              <input ref="fileInput" type="file" multiple accept=".txt,.md,.csv,.json,.yaml,.yml,.xml,.log,.py,.js,.ts,.rs,.html,.css" hidden aria-label="选择 Agent 文本文件" @change="attach">
              <span class="agent-model" :title="model" role="status">{{ attaching ? '读取附件中' : model || '未配置模型' }}</span>
              <Button v-if="unconfirmed" type="button" variant="outline" size="sm" @click="emit('recover')">确认任务状态</Button>
              <PromptInputSubmit v-else :running="locked" :pending="pending" :disabled="locked ? pending : !canSubmit" @stop="emit('cancel')" />
            </div>
          </PromptInput>
        </div>
      </section>
      <aside v-if="settingsOpen" id="agent-settings" class="agent-settings" aria-label="对话设置面板">
        <div class="agent-settings-heading"><strong>对话设置</strong><Button variant="ghost" size="icon-sm" aria-label="关闭对话设置" @click="settingsOpen = false"><XIcon :size="15" /></Button></div>
        <div class="agent-setting"><Label for="agent-max-steps">每轮步骤上限</Label><Input id="agent-max-steps" type="number" min="1" max="32" step="1" :model-value="maxSteps" :disabled="locked" @update:model-value="emit('maxSteps', Number($event))" /></div>
        <dl class="agent-configuration"><div><dt>模型</dt><dd>{{ model || '未配置' }}</dd></div><div><dt>上下文</dt><dd>当前对话文字</dd></div><div><dt>文件范围</dt><dd>本轮附件与产物</dd></div><div><dt>可用工具</dt><dd class="agent-tools"><Badge v-for="tool in tools" :key="tool" variant="outline">{{ tool }}</Badge><span v-if="!tools.length">无</span></dd></div></dl>
      </aside>
    </div>
  </main>
</template>
