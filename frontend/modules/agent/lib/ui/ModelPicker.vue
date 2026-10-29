<script setup lang="ts">
import { ref } from 'vue'
import { CheckIcon, Settings2Icon } from '@lucide/vue'
import { Button, Popover, PopoverContent, PopoverTrigger } from '../../../../ui/shadcn'

defineProps<{ locked: boolean }>()
const emit = defineEmits<{ settings: [] }>()
const open = ref(false)
// Display names requested for the upcoming managed catalog, not provider API identifiers.
const pendingModels = ['GPT-6 Astra', 'GPT-6 Sol', 'GPT-6 Luna', 'GPT-6.1 Sol', 'GPT-6.1 Terra', 'DeepSeek V4.1 Flash', 'DeepSeek V4 Pro']
function showSettings() { open.value = false; emit('settings') }
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="选择模型" title="选择模型"><Settings2Icon :size="16" /></Button>
    </PopoverTrigger>
    <PopoverContent class="agent-model-picker" side="top" align="start" :side-offset="10" :collision-padding="12" aria-label="模型选择">
      <div class="agent-model-picker-header"><strong>模型</strong><Button type="button" variant="ghost" size="sm" @click="showSettings">对话设置</Button></div>
      <div class="agent-model-picker-options" role="group" aria-label="可选模型">
        <Button type="button" variant="ghost" class="agent-model-option" :disabled="locked" :aria-pressed="true" @click="open = false"><span>Auto</span><CheckIcon :size="15" aria-hidden="true" /></Button>
        <Button v-for="name in pendingModels" :key="name" type="button" variant="ghost" class="agent-model-option" disabled :aria-label="name"><span>{{ name }}</span><span class="agent-model-unavailable">未接入</span></Button>
      </div>
    </PopoverContent>
  </Popover>
</template>

<style>
.agent-model-picker { width:280px; max-width:calc(100vw - 24px); max-height:var(--reka-popover-content-available-height); overflow-y:auto; padding:8px; border-radius:16px; }
.agent-model-picker-header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:4px 8px 8px; font-size:13px; }
.agent-model-picker-options { display:flex; flex-direction:column; gap:2px; }
.agent-model-option { display:flex; justify-content:space-between; width:100%; gap:12px; padding:10px 12px; font-size:13px; border-radius:8px; }
.agent-model-option[aria-pressed=true] { background:var(--muted); }
.agent-model-unavailable { font-size:11px; color:var(--muted-foreground); }
@media(prefers-reduced-motion:reduce) { .agent-model-picker { animation:none!important; } }
</style>
