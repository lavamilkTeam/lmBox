<script setup lang="ts">
import { ref } from 'vue'
import { Upload, ChevronDown } from '@lucide/vue'
const input = ref<HTMLInputElement>()
defineProps<{ busy: boolean }>()
const emit = defineEmits<{ files: [files: File[]] }>()
function open() { input.value?.click() }
function change(event: Event) { const el = event.target as HTMLInputElement; if (el.files?.length) emit('files', Array.from(el.files)); el.value = '' }
defineExpose({ open })
</script>
<template>
  <button class="import-button" :disabled="busy" @click="open"><Upload :size="16"/><span>{{ busy ? '正在解析…' : '导入文件' }}</span><span class="button-divider"/><ChevronDown :size="13"/></button>
  <input ref="input" class="sr-only" type="file" multiple accept=".zip,.gtp,.gbp,.gko,.gm1,.gbr,.ger,.gtl,.gbl,.gts,.gbs,.gto,.gbo" aria-label="选择 Gerber 文件" @change="change">
</template>
