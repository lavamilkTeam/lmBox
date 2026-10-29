<script setup lang="ts">
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../shadcn'

defineProps<{ open: boolean; agentAvailable: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; select: [mode: 'agent' | 'advanced'] }>()
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="experience-dialog" :aria-describedby="undefined">
      <DialogHeader><DialogTitle>选择使用方式</DialogTitle></DialogHeader>
      <div class="experience-options">
        <button class="experience-option" type="button" :disabled="!agentAvailable" aria-labelledby="experience-agent-title" aria-describedby="experience-agent-description" @click="emit('select', 'agent')">
          <span id="experience-agent-title" class="experience-title">轻松模式</span>
          <span id="experience-agent-description" class="experience-description">无需熟悉各个模块，描述你的需求，让 AI 帮你完成任务</span>
          <span class="experience-action">{{ agentAvailable ? '进入 Agent' : 'Agent 暂不可用' }}<span aria-hidden="true">↗</span></span>
        </button>
        <button class="experience-option" type="button" aria-labelledby="experience-advanced-title" aria-describedby="experience-advanced-description" @click="emit('select', 'advanced')">
          <span id="experience-advanced-title" class="experience-title">专业模式</span>
          <span id="experience-advanced-description" class="experience-description">自由组合模块，亲自操作与调整，让 Agent 随时辅助</span>
          <span class="experience-action">进入工作台<span aria-hidden="true">↗</span></span>
        </button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style>
.experience-dialog { width:calc(100vw - 40px); max-width:720px; max-height:calc(100dvh - 40px); overflow:auto; padding:32px; gap:28px; border-radius:24px; }
.experience-options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; }
.experience-option { display:flex; flex-direction:column; align-items:stretch; gap:18px; min-width:0; padding:28px; border:1px solid var(--border); border-radius:18px; background:var(--card); color:var(--foreground); text-align:left; font:inherit; cursor:pointer; transition:background .15s,border-color .15s; }
.experience-option:hover:not(:disabled) { background:var(--muted); border-color:var(--foreground); }
.experience-option:focus-visible { outline:2px solid var(--ring); outline-offset:4px; }
.experience-option:disabled { opacity:.5; cursor:not-allowed; }
.experience-title { font-size:22px; line-height:1.3; font-weight:600; letter-spacing:-.02em; }
.experience-description { font-size:14px; line-height:1.9; color:var(--muted-foreground); }
.experience-action { display:flex; justify-content:space-between; gap:12px; margin-top:auto; padding-top:18px; font-size:13px; font-weight:500; }
@media (max-width:560px) { .experience-dialog { padding:24px; gap:22px; } .experience-options { grid-template-columns:1fr; gap:14px; } .experience-option { padding:22px; gap:12px; } .experience-action { padding-top:8px; } }
@media (prefers-reduced-motion:reduce) { .experience-option { transition:none; } }
</style>
