<script setup lang="ts">
import { computed, ref } from 'vue'
import { guideTools, useGuideFlow } from '../domain/flow'
import { GuideLibrary, FlowCanvas } from '../ui'
import '../ui/workspace.css'
const emit = defineEmits<{ open: [id: string] }>()
const flow = useGuideFlow()
const canvas = ref<InstanceType<typeof FlowCanvas>>()
const message = ref('')
const nodes = computed(() => flow.nodes.map(node => ({ ...guideTools.find(tool => tool.id === node.toolId)!, ...node })))
function add(id: string, x?: number, y?: number) {
  const origin = canvas.value?.insertionPoint() ?? { x: 64, y: 64 }
  const nodeId = flow.add(id, x ?? origin.x, y ?? origin.y)
  if (nodeId) message.value = '已添加功能节点，可拖动标题调整位置'
}
function connect(source: string, target: string) {
  message.value = flow.connect(source, target) || '已连接两个功能节点'
}
function open(id: string) {
  const node = flow.nodes.find(node => node.id === id)
  if (node && guideTools.some(tool => tool.id === node.toolId && tool.available)) emit('open', node.toolId)
}
</script>
<template>
  <main class="guide-workspace">
    <GuideLibrary :tools="guideTools" @add="add" />
    <FlowCanvas ref="canvas" :nodes="nodes" :edges="flow.edges" :message="message" @add="add" @move="flow.move"
      @connect="connect" @remove-node="flow.removeNode" @remove-edge="flow.removeEdge" @open="open" />
  </main>
</template>
