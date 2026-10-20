<script setup lang="ts">
import { computed, ref } from 'vue'
import { FlowWorkspace, FlowLibrary, FlowCanvas } from '../../../../ui/flow-editor'
import { HelpDialog } from '../../../../ui/help-dialog'
import { logicGateTutorials } from '../../../../ui/logic-circuit-tutorial-gifs'
import CircuitSymbol from './CircuitSymbol.vue'
import { circuitGeometry, circuitSymbols } from './symbols'

const props = defineProps<{
  tools: readonly { id: string; label: string; category: string; inputs: readonly string[]; description: string; source: { label: string; url: string } }[]
  activeHelpId: string | null
  nodes: { id: string; gateId: string; x: number; y: number }[]
  edges: { id: string; source: string; target: string; targetPort: string }[]
}>()
const emit = defineEmits<{
  add: [id: string, x: number, y: number]; move: [id: string, x: number, y: number]
  connect: [source: string, target: string, targetPort?: string]; removeNode: [id: string]; removeEdge: [id: string]
  helpOpen: [id: string, open: boolean]
}>()
const canvas = ref<InstanceType<typeof FlowCanvas>>()
const tools = computed(() => props.tools.map(tool => ({ ...tool, kind: 'electrical', available: false })))
const nodes = computed(() => props.nodes.map(node => {
  const tool = tools.value.find(tool => tool.id === node.gateId)!
  return { ...tool, ...node, ...circuitGeometry(node.gateId, tool.inputs) }
}))
function gateId(id: string) { return props.nodes.find(node => node.id === id)!.gateId }
function add(id: string, x?: number, y?: number) {
  const origin = canvas.value?.insertionPoint() ?? { x: 48, y: 64 }
  emit('add', id, x ?? origin.x, y ?? origin.y)
}
</script>
<template>
  <FlowWorkspace>
    <FlowLibrary :tools="tools" title="元件库" label="电路元件列表" navigation-label="电路元件库" search-label="搜索电路元件" placeholder="搜索电路元件…" @add="add">
      <template #tool-actions="{ tool }">
        <HelpDialog :open="activeHelpId === tool.id" :title="tool.label"
          :description="props.tools.find(gate => gate.id === tool.id)!.description"
          :source="props.tools.find(gate => gate.id === tool.id)!.source"
          :image-src="tool.id === 'hd44780' ? circuitSymbols[tool.id] : logicGateTutorials[tool.id]"
          :image-alt="tool.id === 'hd44780' ? `${tool.label}引脚示意图` : `${tool.label}真值表示意动画`"
          @update:open="open => emit('helpOpen', tool.id, open)" />
      </template>
    </FlowLibrary>
    <FlowCanvas ref="canvas" :nodes="nodes" :edges="edges" label="数字逻辑编辑器" canvas-label="逻辑电路画布" wire-style="orthogonal" :drop-anchor="{ x: 100, y: 50 }"
      @add="add" @move="(id, x, y) => emit('move', id, x, y)" @connect="(source, target, port) => emit('connect', source, target, port)"
      @remove-node="id => emit('removeNode', id)" @remove-edge="id => emit('removeEdge', id)">
      <template #node="{ node, startMove, endMove, keyboardMove, remove }">
        <CircuitSymbol :gate-id="gateId(node.id)" :label="node.label" @move-start="startMove" @move-end="endMove" @keyboard-move="keyboardMove" @remove="remove" />
      </template>
    </FlowCanvas>
  </FlowWorkspace>
</template>
