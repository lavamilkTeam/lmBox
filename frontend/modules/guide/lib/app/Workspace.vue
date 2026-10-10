<script setup lang="ts">
import { computed, ref } from 'vue'
import { guideTools, useGuideFlow } from '../domain/flow'
import { GuideLibrary, FlowCanvas } from '../ui'
import { useNotification } from '../../../../ui/theme'
import '../ui/workspace.css'
const emit = defineEmits<{ open: [id: string] }>()
const flow = useGuideFlow()
const canvas = ref<InstanceType<typeof FlowCanvas>>()
const notification = useNotification()
const nodes = computed(() => flow.nodes.map(node => ({ ...guideTools.find(tool => tool.id === node.toolId)!, ...node })))
function add(id: string, x?: number, y?: number) {
  const origin = canvas.value?.insertionPoint() ?? { x: 64, y: 64 }
  flow.add(id, x ?? origin.x, y ?? origin.y)
}
function connect(source: string, target: string) {
  const error = flow.connect(source, target)
  if (error) notification.warning(error)
}
function open(id: string) {
  const node = flow.nodes.find(node => node.id === id)
  if (node && guideTools.some(tool => tool.id === node.toolId && tool.available)) emit('open', node.toolId)
}
</script>
<template>
  <main class="guide-workspace">
    <GuideLibrary :tools="guideTools" @add="add" />
    <FlowCanvas ref="canvas" :nodes="nodes" :edges="flow.edges" @add="add" @move="flow.move"
      @connect="connect" @remove-node="flow.removeNode" @remove-edge="flow.removeEdge" @open="open" />
  </main>
</template>
