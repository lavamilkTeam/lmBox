<script setup lang="ts">
import { ref } from 'vue'
import { ImportButton } from '../../../../../../ui/import-button'
const input = ref<HTMLInputElement>()
defineProps<{ busy: boolean }>()
const emit = defineEmits<{ files: [files: File[]] }>()
function open() { input.value?.click() }
function change(event: Event) { const el = event.target as HTMLInputElement; if (el.files?.length) emit('files', Array.from(el.files)); el.value = '' }
defineExpose({ open })
</script>
<template>
  <ImportButton
    :disabled="busy"
    :label="busy ? '正在解析…' : '导入文件'"
    :tooltip="busy ? '正在解析…' : '导入'"
    :aria-busy="busy"
    @click="open"
  />
  <input ref="input" class="sr-only" type="file" multiple accept=".zip,.gtp,.gbp,.gko,.gm1,.gbr,.ger,.gtl,.gbl,.gts,.gbs,.gto,.gbo" aria-label="选择 Gerber 文件" @change="change">
</template>
