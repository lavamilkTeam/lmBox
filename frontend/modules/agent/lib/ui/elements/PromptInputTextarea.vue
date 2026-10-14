<!-- AI Elements Vue, Copyright 2025 cwandev, Apache-2.0. Changed for lmBox: controlled shadcn Textarea; keep IME/Shift+Enter, remove clipboard/file side effects and eager clearing. See NOTICE. -->
<script setup lang="ts">
import { ref } from 'vue'
import { Textarea } from '../../../../../ui/shadcn'
const props = defineProps<{ modelValue: string; disabled: boolean; canSubmit: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const composing = ref(false)
function keydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || composing.value || event.isComposing || event.keyCode === 229 || event.shiftKey) return
  event.preventDefault()
  if (!props.canSubmit) return
  const textarea = event.currentTarget as HTMLTextAreaElement
  if (textarea.form?.querySelector<HTMLButtonElement>('button[type="submit"]:enabled')) textarea.form.requestSubmit()
}
</script>
<template>
  <Textarea :model-value="modelValue" :disabled="disabled" class="agent-prompt" aria-label="Agent 任务" placeholder="输入消息" name="message"
    @update:model-value="emit('update:modelValue', String($event))" @keydown="keydown" @compositionstart="composing = true" @compositionend="composing = false" />
</template>
