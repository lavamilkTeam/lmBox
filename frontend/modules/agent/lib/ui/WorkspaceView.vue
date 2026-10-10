<script setup lang="ts">
import { ref } from 'vue'
import { Badge, Button, Card, Input, Label, Textarea } from '../../../../ui/shadcn'
import type { AgentArtifactView, AgentFileView } from './types'
const props = defineProps<{
  prompt: string; maxSteps: number; files: AgentFileView[]; configured: boolean; inspecting: boolean; model: string; tools: string[]
  locked: boolean; pending: boolean; unconfirmed: boolean; status: string; error: string; connectionError: string; events: string[]; answer: string
  artifacts: AgentArtifactView[]; artifactBusy: boolean
}>()
const emit = defineEmits<{
  prompt: [value: string]; maxSteps: [value: number]; files: [files: File[]]; removeFile: [index: number]
  inspect: []; run: []; recover: []; cancel: []; download: [id: string]; exportAnswer: []
}>()
const fileInput = ref<HTMLInputElement>()
function attach(event: Event) { const input = event.target as HTMLInputElement; const files = Array.from(input.files ?? []); if (files.length) emit('files', files); input.value = '' }
</script>
<template>
  <main class="agent-workspace" aria-label="AI 工作助手">
    <header class="agent-toolbar"><strong>AI 工作助手</strong><Badge variant="outline">{{ status }}</Badge><Button variant="outline" size="sm" :disabled="inspecting" @click="emit('inspect')">{{ inspecting ? '连接中' : '刷新连接' }}</Button></header>
    <div v-if="connectionError" class="agent-error" role="alert">{{ connectionError }}</div>
    <div v-if="error" class="agent-error" role="alert">{{ error }}</div>
    <div class="agent-content">
      <section class="agent-task" aria-label="工作任务">
        <div class="agent-field"><Label for="agent-prompt">任务</Label><Textarea id="agent-prompt" class="agent-prompt" :model-value="prompt" :disabled="locked" aria-label="Agent 任务" @update:model-value="emit('prompt', String($event))" /></div>
        <div class="agent-controls"><div class="agent-step-field"><Label for="agent-max-steps">步骤上限</Label><Input id="agent-max-steps" type="number" min="1" max="32" step="1" :model-value="maxSteps" :disabled="locked" @update:model-value="emit('maxSteps', Number($event))" /></div><Button variant="outline" size="sm" :disabled="locked" @click="fileInput?.click()">添加文本文件</Button><input ref="fileInput" type="file" multiple accept=".txt,.md,.csv,.json,.yaml,.yml,.xml,.log,.py,.js,.ts,.rs,.html,.css" hidden aria-label="选择 Agent 文本文件" @change="attach"></div>
        <ul v-if="files.length" class="agent-files"><li v-for="(file, index) in files" :key="file.name"><span>{{ file.name }}</span><Badge variant="outline">{{ file.size }} 字符</Badge><Button variant="ghost" size="sm" :disabled="locked" :aria-label="`移除附件 ${file.name}`" @click="emit('removeFile', index)">移除</Button></li></ul>
        <div class="agent-run-controls"><Button v-if="unconfirmed" variant="outline" @click="emit('recover')">确认任务状态</Button><Button v-else-if="locked" variant="outline" :disabled="pending" @click="emit('cancel')">取消任务</Button><Button v-else :disabled="!configured || !prompt.trim()" @click="emit('run')">执行任务</Button></div>
        <Card class="agent-configuration"><div class="agent-config-row"><Label>模型</Label><span>{{ model || '未配置' }}</span></div><div class="agent-config-row"><Label>可用工具</Label><div class="agent-tools"><Badge v-for="tool in tools" :key="tool" variant="outline">{{ tool }}</Badge><span v-if="!tools.length">无</span></div></div></Card>
      </section>
      <section class="agent-output" aria-label="Agent 执行结果">
        <section v-if="events.length" class="agent-log" aria-label="Agent 执行日志" aria-live="polite"><strong>执行记录</strong><ol><li v-for="(event, index) in events" :key="index">{{ event }}</li></ol></section>
        <section v-if="answer" class="agent-answer"><div class="agent-answer-heading"><strong>结果</strong><Button variant="outline" size="sm" @click="emit('exportAnswer')">保存结果</Button></div><pre>{{ answer }}</pre></section>
        <section v-if="artifacts.length" class="agent-artifacts" aria-label="Agent 结果文件"><strong>结果文件</strong><div v-for="artifact in artifacts" :key="artifact.id" class="agent-artifact"><span>{{ artifact.name }}</span><Button variant="outline" size="sm" :disabled="artifactBusy" @click="emit('download', artifact.id)">下载</Button></div></section>
      </section>
    </div>
  </main>
</template>
