<script setup lang="ts">
import { Maximize2Icon } from '@lucide/vue'
import { Button, Card, CardHeader, CardTitle } from '../../../../ui/shadcn'

defineProps<{ sidebar: boolean }>()
const emit = defineEmits<{ expand: [] }>()
</script>

<template>
  <Card v-if="sidebar" class="agent-sidebar-panel border-0 rounded-none shadow-none" role="region" aria-label="AI 助手">
    <CardHeader class="agent-sidebar-header">
      <CardTitle class="agent-sidebar-title">AI 助手</CardTitle>
      <Button variant="ghost" size="icon-sm" aria-label="展开到 Agent 工作区" title="展开到 Agent 工作区" @click="emit('expand')"><Maximize2Icon :size="16" /></Button>
    </CardHeader>
    <div class="agent-sidebar-body"><slot /></div>
  </Card>
  <slot v-else />
</template>
