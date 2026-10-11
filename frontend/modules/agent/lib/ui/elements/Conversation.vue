<!-- AI Elements Vue, Copyright 2025 cwandev, Apache-2.0. Changed for lmBox: Vue-owned scroll policy; removed SDK/Markdown providers and external scroll runtime. See NOTICE. -->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ArrowDownIcon } from '@lucide/vue'
import { Button } from '../../../../../ui/shadcn'
const props = defineProps<{ followKey: string }>()
const viewport = ref<HTMLElement>(), following = ref(true)
function trackPosition() {
  const element = viewport.value
  if (element) following.value = element.scrollHeight - element.scrollTop - element.clientHeight < 48
}
function scrollToBottom() {
  if (viewport.value) viewport.value.scrollTop = viewport.value.scrollHeight
  following.value = true
}
watch(() => props.followKey, () => { if (following.value) scrollToBottom() }, { flush: 'post' })
onMounted(scrollToBottom)
</script>
<template>
  <div class="agent-conversation">
    <div ref="viewport" class="agent-conversation-scroll" role="log" aria-label="对话记录" aria-live="polite" @scroll="trackPosition"><slot /></div>
    <Button v-if="!following" class="agent-scroll-latest" variant="outline" size="icon" aria-label="滚动到最新消息" @click="scrollToBottom"><ArrowDownIcon :size="16" /></Button>
  </div>
</template>
