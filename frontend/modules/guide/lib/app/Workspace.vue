<script setup lang="ts">
import { computed, ref } from 'vue'
import { guideTools, useGuideFlow } from '../domain/flow'
import { FlowLibrary, FlowCanvas, FlowWorkspace } from '../../../../ui/flow-editor'
import { useNotification } from '../../../../ui/theme'
const props = defineProps<{ installedIds?: string[] | null }>()
const tools = computed(() => guideTools.map(tool => ({ ...tool, available: tool.available && (!props.installedIds || props.installedIds.includes(tool.id)) })))
const emit = defineEmits<{ open: [id: string] }>()
const flow = useGuideFlow()
const canvas = ref<InstanceType<typeof FlowCanvas>>()
const notification = useNotification()
const nodes = computed(() => flow.nodes.map(node => ({ ...tools.value.find(tool => tool.id === node.toolId)!, ...node })))
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
  if (node && tools.value.some(tool => tool.id === node.toolId && tool.available)) emit('open', node.toolId)
}
</script>
<template>
  <FlowWorkspace>
    <FlowLibrary :tools="tools" @add="add" />
    <FlowCanvas ref="canvas" :nodes="nodes" :edges="flow.edges" @add="add" @move="flow.move"
      empty-title="拖入左侧模块，搭建工作与仿真流程" empty-description="也可以与 Agent 聊聊，让它帮你规划下一步"
      @connect="connect" @remove-node="flow.removeNode" @remove-edge="flow.removeEdge" @open="open" />
  </FlowWorkspace>
</template>
