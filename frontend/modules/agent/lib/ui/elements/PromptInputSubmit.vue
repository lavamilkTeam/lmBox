<!-- AI Elements Vue, Copyright 2025 cwandev, Apache-2.0. Changed for lmBox: public shadcn Button and actual request states; no AI SDK status dependency. See NOTICE. -->
<script setup lang="ts">
import { ArrowUpIcon, Loader2Icon, SquareIcon } from '@lucide/vue'
import { Button } from '../../../../../ui/shadcn'
defineProps<{ disabled: boolean; running: boolean; pending: boolean }>()
const emit = defineEmits<{ stop: [] }>()
</script>
<template>
  <Button :type="running ? 'button' : 'submit'" :disabled="disabled" size="icon" :aria-label="running ? '取消任务' : '发送消息'" @click="running && emit('stop')">
    <Loader2Icon v-if="pending" :size="16" class="animate-spin" /><SquareIcon v-else-if="running" :size="15" /><ArrowUpIcon v-else :size="18" />
  </Button>
</template>
