<script setup lang="ts">
import { computed, ref } from 'vue'
import { FlowWorkspace, FlowLibrary, FlowCanvas } from '../../../../ui/flow-editor'
import { HelpDialog } from '../../../../ui/help-dialog'
import { Button, Popover, PopoverContent, PopoverTrigger } from '../../../../ui/shadcn'
import { logicGateTutorials } from '../../../../ui/logic-circuit-tutorial-gifs'
import CircuitSymbol from './CircuitSymbol.vue'
import { circuitGeometry, circuitSymbols } from './symbols'
import type { SimulationView } from './simulation-view'

const props = defineProps<{
  tools: readonly { id: string; label: string; category: string; inputs: readonly string[]; description: string; source?: { label: string; url: string } }[]
  activeHelpId: string | null
  nodes: { id: string; gateId: string; x: number; y: number }[]
  edges: { id: string; source: string; target: string; targetPort: string }[]
  simulation: SimulationView
}>()
const emit = defineEmits<{
  add: [id: string, x: number, y: number]; move: [id: string, x: number, y: number]
  connect: [source: string, target: string, targetPort?: string]; removeNode: [id: string]; removeEdge: [id: string]
  helpOpen: [id: string, open: boolean]
  simulationToggle: []; simulationStep: []; simulationReset: []; inputToggle: [nodeId: string]
}>()
const canvas = ref<InstanceType<typeof FlowCanvas>>()
const diagnostics = computed(() => props.simulation.result?.diagnostics ?? [])
const tools = computed(() => props.tools.map(tool => ({ ...tool, kind: 'electrical', available: false })))
const nodes = computed(() => props.nodes.map(node => {
  const tool = tools.value.find(tool => tool.id === node.gateId)!
  return { ...tool, ...node, ...circuitGeometry(node.gateId, tool.inputs) }
}))
function gateId(id: string) { return props.nodes.find(node => node.id === id)!.gateId }
function signal(id: string) {
  return gateId(id) === 'probe' ? props.simulation.result?.inputs[id]?.A : props.simulation.result?.outputs[id]
}
function diagnosticLabel(id?: string) {
  const node = props.nodes.find(node => node.id === id)
  return node ? props.tools.find(tool => tool.id === node.gateId)?.label : undefined
}
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
    <section class="logic-editor-stage" aria-label="数字逻辑仿真">
      <div class="logic-simulation-toolbar" role="toolbar" aria-label="数字逻辑仿真控制">
        <Button type="button" variant="outline" size="sm" :aria-label="simulation.running ? '暂停仿真' : '运行仿真'" :disabled="simulation.busy && !simulation.running" @click="emit('simulationToggle')">{{ simulation.running ? '暂停' : '运行' }}</Button>
        <Button type="button" variant="ghost" size="sm" aria-label="单步仿真" :disabled="simulation.busy || simulation.running" @click="emit('simulationStep')">步进</Button>
        <Button type="button" variant="ghost" size="sm" aria-label="复位仿真" :disabled="simulation.busy" @click="emit('simulationReset')">复位</Button>
        <output class="logic-simulation-tick" aria-label="仿真步数">t = {{ simulation.result?.tick ?? '—' }}</output>
        <span class="logic-simulation-status" role="status">{{ simulation.busy ? '计算中…' : simulation.status }}</span>
        <Popover>
          <PopoverTrigger as-child>
            <Button type="button" variant="ghost" size="sm" aria-label="仿真诊断" class="logic-diagnostics-trigger">诊断 {{ diagnostics.length }}</Button>
          </PopoverTrigger>
          <PopoverContent align="end" class="logic-simulation-diagnostics" aria-label="仿真诊断">
            <ul v-if="diagnostics.length"><li v-for="(diagnostic, index) in diagnostics" :key="index"><span v-if="diagnosticLabel(diagnostic.nodeId)">{{ diagnosticLabel(diagnostic.nodeId) }}： </span>{{ diagnostic.message }}</li></ul>
            <p v-else>{{ simulation.busy ? '计算中…' : '暂无诊断' }}</p>
          </PopoverContent>
        </Popover>
      </div>
      <p v-if="simulation.error" class="logic-simulation-error" role="alert">{{ simulation.error }}</p>
      <FlowCanvas ref="canvas" :nodes="nodes" :edges="edges" label="数字逻辑编辑器" canvas-label="逻辑电路画布" wire-style="orthogonal" :drop-anchor="{ x: 100, y: 50 }"
      @add="add" @move="(id, x, y) => emit('move', id, x, y)" @connect="(source, target, port) => emit('connect', source, target, port)"
      @remove-node="id => emit('removeNode', id)" @remove-edge="id => emit('removeEdge', id)">
      <template #node="{ node, startMove, endMove, keyboardMove, remove }">
        <CircuitSymbol :gate-id="gateId(node.id)" :label="node.label" :signal="signal(node.id)" :input-value="simulation.values[node.id]" :display="simulation.result?.displays[node.id]"
          @move-start="startMove" @move-end="endMove" @keyboard-move="keyboardMove" @remove="remove" @input-toggle="emit('inputToggle', node.id)" />
      </template>
      </FlowCanvas>
    </section>
  </FlowWorkspace>
</template>

<style scoped>
.logic-editor-stage { position:relative; display:flex; flex-direction:column; min-width:0; min-height:0; }
.logic-editor-stage :deep(.guide-board) { flex:1; }
.logic-simulation-toolbar { display:flex; align-items:center; gap:6px; flex:0 0 49px; height:49px; padding:8px 12px; border-bottom:1px solid var(--border); overflow-x:auto; }
.logic-simulation-toolbar button { flex-shrink:0; font-size:12px; }
.logic-simulation-tick { margin-left:8px; font:12px/1.5 ui-monospace,monospace; white-space:nowrap; }
.logic-simulation-status { margin-left:auto; flex-shrink:0; font-size:11px; color:var(--muted-foreground); white-space:nowrap; }
.logic-diagnostics-trigger { min-width:66px; font-variant-numeric:tabular-nums; }
.logic-simulation-error { position:absolute; top:49px; left:12px; right:12px; z-index:5; margin:6px 0 0; padding:8px 12px; border:1px solid var(--destructive); border-radius:6px; background:var(--background); color:var(--destructive); font-size:12px; overflow-wrap:anywhere; }
.logic-simulation-diagnostics { padding:10px 12px; font-size:12px; max-height:min(320px,var(--reka-popover-content-available-height)); overflow:auto; overflow-wrap:anywhere; }
.logic-simulation-diagnostics ul { margin:0; padding-left:18px; }
.logic-simulation-diagnostics li + li { margin-top:6px; }
.logic-simulation-diagnostics p { margin:0; }
</style>
