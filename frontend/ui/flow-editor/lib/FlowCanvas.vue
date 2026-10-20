<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { ArrowUpRight, X, Minus, Plus, Trash2 } from '@lucide/vue'
import { Button, Card, CardHeader, CardTitle, CardFooter } from '../../shadcn'
import type { NodeView, EdgeView } from './types'
const props = withDefaults(defineProps<{
  nodes: NodeView[]; edges: EdgeView[]; label?: string; canvasLabel?: string; nodeHeight?: number
  wireStyle?: 'curve' | 'orthogonal'; dropAnchor?: { x: number; y: number }
  emptyTitle?: string; emptyDescription?: string
}>(), {
  label: '引导界面', canvasLabel: '流程画布', nodeHeight: 88, wireStyle: 'curve', dropAnchor: () => ({ x: 116, y: 26 }),
})
const emit = defineEmits<{
  add: [id: string, x: number, y: number]; move: [id: string, x: number, y: number]
  connect: [source: string, target: string, targetPort?: string]; removeNode: [id: string]; removeEdge: [id: string]; open: [id: string]
}>()
const arrowId = `flow-arrow-${useId()}`
const viewport = ref<HTMLElement>()
const zoom = ref(1)
const source = ref<string | null>(null)
const selectedEdge = ref<string | null>(null)
const dropping = ref(false)
const drag = ref<{ id: string; pointer: number; clientX: number; clientY: number; x: number; y: number } | null>(null)
const wireDrag = ref<{ id: string; pointer: number; x: number; y: number; moved: boolean } | null>(null)
const cursor = ref({ x: 0, y: 0 })
const width = computed(() => Math.max(1400, ...props.nodes.map(node => node.x + (node.width ?? 232) + 112)))
const height = computed(() => Math.max(900, ...props.nodes.map(node => node.y + (node.height ?? props.nodeHeight) + 144)))
const sourceNode = computed(() => props.nodes.find(node => node.id === source.value))
const selected = computed(() => props.edges.find(edge => edge.id === selectedEdge.value))
watch(() => props.nodes.map(node => node.id), ids => { if (source.value && !ids.includes(source.value)) source.value = null })
watch(() => props.edges.map(edge => edge.id), ids => { if (selectedEdge.value && !ids.includes(selectedEdge.value)) selectedEdge.value = null })
function inputPorts(node: NodeView) { return node.ports?.inputs.map(port => port.id) ?? node.inputPorts ?? [''] }
function defaultPortY(node: NodeView, port?: string) {
  if (!node.inputPorts) return 70
  const index = port === undefined ? (node.inputPorts.length - 1) / 2 : node.inputPorts.indexOf(port)
  return 92 + (index - (node.inputPorts.length - 1) / 2) * 28
}
function inputPosition(node: NodeView, port: string) { return node.ports?.inputs.find(input => input.id === port) ?? { x: 0, y: defaultPortY(node, port) } }
function outputPosition(node: NodeView) { return node.ports?.output ?? { x: node.width ?? 232, y: defaultPortY(node) } }
function inputLabel(node: NodeView, port: string) { return `${node.label}输入端${port ? ` ${port}` : ''}` }
function point(clientX: number, clientY: number) {
  const el = viewport.value!
  const rect = el.getBoundingClientRect()
  return { x: (clientX - rect.left + el.scrollLeft) / zoom.value, y: (clientY - rect.top + el.scrollTop) / zoom.value }
}
function insertionPoint() {
  const el = viewport.value
  const baseX = (el?.scrollLeft ?? 0) / zoom.value + 48
  const baseY = (el?.scrollTop ?? 0) / zoom.value + 64
  let y = baseY
  for (;;) {
    const collision = props.nodes.find(node => Math.abs(node.x - baseX) < (node.width ?? 232) + 12 && Math.abs(node.y - y) < (node.height ?? props.nodeHeight) + 54)
    if (!collision) break
    y = collision.y + (collision.height ?? props.nodeHeight) + 76
  }
  return { x: baseX, y }
}
defineExpose({ insertionPoint })
function drop(event: DragEvent) {
  dropping.value = false
  const id = event.dataTransfer?.getData('application/x-lmbox-guide-tool')
  if (!id) return
  const p = point(event.clientX, event.clientY)
  emit('add', id, p.x - props.dropAnchor.x, p.y - props.dropAnchor.y)
}
function dragOver(event: DragEvent) {
  if (!event.dataTransfer?.types.includes('application/x-lmbox-guide-tool')) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
  dropping.value = true
}
function startMove(event: PointerEvent, node: NodeView) {
  if (event.button !== 0) return
  source.value = null
  drag.value = { id: node.id, pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: node.x, y: node.y }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function move(event: PointerEvent) {
  cursor.value = point(event.clientX, event.clientY)
  const wire = wireDrag.value
  if (wire && wire.pointer === event.pointerId && (wire.moved || Math.hypot(event.clientX - wire.x, event.clientY - wire.y) > 4)) {
    if (!wire.moved) viewport.value?.setPointerCapture(event.pointerId)
    wire.moved = true
    source.value = wire.id
    return
  }
  const current = drag.value
  if (current && current.pointer === event.pointerId) emit('move', current.id, current.x + (event.clientX - current.clientX) / zoom.value, current.y + (event.clientY - current.clientY) / zoom.value)
}
function startLink(node: NodeView) {
  source.value = source.value === node.id ? null : node.id
  const port = outputPosition(node)
  cursor.value = { x: node.x + port.x, y: node.y + port.y }
}
function beginWire(event: PointerEvent, id: string) {
  if (event.button !== 0) return
  wireDrag.value = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
}
function endWire(event: PointerEvent) {
  const wire = wireDrag.value
  if (!wire || wire.pointer !== event.pointerId) return
  wireDrag.value = null
  if (!wire.moved) return
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-flow-input]')
  if (target && viewport.value?.contains(target)) finishLink(target.dataset.flowInput!, target.dataset.flowPort ?? '')
  else source.value = null
  if (viewport.value?.hasPointerCapture(event.pointerId)) viewport.value.releasePointerCapture(event.pointerId)
}
function cancelWire() { if (wireDrag.value?.moved) source.value = null; wireDrag.value = null }
function finishLink(id: string, port: string) {
  if (!source.value) return
  emit('connect', source.value, id, port || undefined)
  source.value = null
}
function path(x1: number, y1: number, x2: number, y2: number) {
  if (props.wireStyle === 'orthogonal') {
    if (x2 >= x1 + 40) {
      const middle = (x1 + x2) / 2
      return `M ${x1} ${y1} H ${middle} V ${y2} H ${x2}`
    }
    const middleY = Math.abs(y2 - y1) < 40 ? Math.max(y1, y2) + 80 : (y1 + y2) / 2
    return `M ${x1} ${y1} H ${x1 + 20} V ${middleY} H ${x2 - 20} V ${y2} H ${x2}`
  }
  const bend = Math.max(64, Math.abs(x2 - x1) / 2)
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
}
const lines = computed(() => props.edges.flatMap(edge => {
  const a = props.nodes.find(node => node.id === edge.source), b = props.nodes.find(node => node.id === edge.target)
  if (!a || !b) return []
  const from = outputPosition(a), to = inputPosition(b, edge.targetPort ?? '')
  return [{ ...edge, label: `${a.label} → ${b.label}${edge.targetPort ? ` ${edge.targetPort}` : ''}`, path: path(a.x + from.x, a.y + from.y, b.x + to.x, b.y + to.y) }]
}))
const previewPath = computed(() => {
  const node = sourceNode.value
  if (!node) return ''
  const port = outputPosition(node)
  return path(node.x + port.x, node.y + port.y, cursor.value.x, cursor.value.y)
})
function keyboardMove(event: KeyboardEvent, node: NodeView) {
  const delta: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }
  const step = delta[event.key]
  if (step) { event.preventDefault(); emit('move', node.id, node.x + step[0], node.y + step[1]) }
}
function removeNode(id: string) { if (source.value === id) source.value = null; emit('removeNode', id) }
function removeSelected() { if (selected.value) emit('removeEdge', selected.value.id); selectedEdge.value = null }
function setZoom(value: number) { zoom.value = Math.min(1.5, Math.max(0.5, Math.round(value * 10) / 10)) }
</script>
<template>
  <section class="guide-board" :aria-label="label" :class="{ 'guide-circuit-board': wireStyle === 'orthogonal' }" @keydown.esc="source = null; selectedEdge = null; cancelWire()">
    <div ref="viewport" class="guide-viewport" :class="{ 'is-dropping': dropping, 'is-connecting': source }" :aria-label="canvasLabel"
      @dragover="dragOver" @dragleave="dropping = false" @drop.prevent="drop" @pointermove="move" @pointerup="endWire" @pointercancel="cancelWire" @lostpointercapture="cancelWire">
      <div class="guide-scroll-space" :style="{ width: `${width * zoom}px`, height: `${height * zoom}px` }">
        <div class="guide-surface" :style="{ width: `max(${width}px, ${100 / zoom}%)`, height: `max(${height}px, ${100 / zoom}%)`, transform: `scale(${zoom})` }" @click.self="source = null; selectedEdge = null">
          <svg class="guide-connections" :width="width" :height="height" aria-label="功能连接">
            <defs><marker :id="arrowId" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
            <g v-for="line in lines" :key="line.id" :class="{ 'is-selected': selectedEdge === line.id }">
              <path class="guide-edge" :d="line.path" :marker-end="wireStyle === 'curve' ? `url(#${arrowId})` : undefined" />
              <path class="guide-edge-hit" :d="line.path" role="button" tabindex="0" :aria-label="`连接：${line.label}`" :aria-pressed="selectedEdge === line.id"
                @click.stop="selectedEdge = line.id" @keydown.enter.prevent="selectedEdge = line.id" @keydown.space.prevent="selectedEdge = line.id"
                @keydown.delete.prevent="emit('removeEdge', line.id)" @keydown.backspace.prevent="emit('removeEdge', line.id)" />
            </g>
            <path v-if="sourceNode" class="guide-edge guide-edge-preview" :d="previewPath" />
          </svg>
          <component :is="$slots.node ? 'article' : Card" role="article" v-for="node in nodes" :key="node.id" class="guide-node" :data-kind="node.kind" :data-node-id="node.id" :aria-label="node.label"
            :class="{ 'is-link-source': source === node.id, 'is-moving': drag?.id === node.id, 'guide-symbol-node': !!$slots.node }" :style="{ left: `${node.x}px`, top: `${node.y}px`, width: `${node.width ?? 232}px`, height: `${node.height ?? nodeHeight}px` }">
            <slot v-if="$slots.node" name="node" :node="node" :start-move="(event: PointerEvent) => startMove(event, node)" :end-move="() => drag = null"
              :keyboard-move="(event: KeyboardEvent) => keyboardMove(event, node)" :remove="() => removeNode(node.id)" />
            <template v-else>
            <CardHeader class="guide-node-header"><CardTitle class="guide-node-title">
            <Button variant="ghost" size="sm" class="guide-node-heading" :aria-label="`移动${node.label}`" @pointerdown="startMove($event, node)" @pointerup="drag = null" @pointercancel="drag = null" @lostpointercapture="drag = null" @keydown="keyboardMove($event, node)">
              <span>{{ node.label }}</span>
            </Button>
            </CardTitle></CardHeader>
            <slot name="node-body" :node="node" />
            <Button variant="ghost" size="icon-xs" class="guide-node-delete" :aria-label="`移除${node.label}`" @click="removeNode(node.id)"><X :size="13" /></Button>
            <CardFooter class="guide-node-bottom"><Button v-if="node.available" variant="ghost" size="sm" :aria-label="`打开${node.label}`" @click="emit('open', node.id)">打开 <ArrowUpRight :size="13" /></Button></CardFooter>
            </template>
            <Button v-for="port in inputPorts(node)" :key="port" variant="ghost" size="icon-xs" class="guide-port guide-port-in" :data-flow-input="node.id" :data-flow-port="port"
              :style="{ left: `${inputPosition(node, port).x - 10}px`, top: `${inputPosition(node, port).y - 10}px` }" :class="{ 'is-ready': source && source !== node.id }" :aria-label="inputLabel(node, port)" :title="inputLabel(node, port)" @click="finishLink(node.id, port)"><span v-if="port && !$slots.node" class="guide-port-label">{{ port }}</span></Button>
            <Button variant="ghost" size="icon-xs" class="guide-port guide-port-out" :style="{ left: `${outputPosition(node).x - 10}px`, right: 'auto', top: `${outputPosition(node).y - 10}px` }"
              :aria-label="`${node.label}输出端`" :title="`${node.label}输出端`" :aria-pressed="source === node.id" @pointerdown.stop="beginWire($event, node.id)" @click="startLink(node)" />
          </component>
        </div>
      </div>
    </div>
    <div v-if="!nodes.length && emptyTitle" class="guide-empty" role="status"><p>{{ emptyTitle }}</p><p v-if="emptyDescription">{{ emptyDescription }}</p></div>
    <div class="guide-floating-tools">
      <Button variant="outline" size="sm" v-if="source" class="guide-remove-link" @click="source = null">取消连线 <X :size="12" /></Button>
      <Button variant="outline" size="sm" v-if="selected" class="guide-remove-link" @click="removeSelected"><Trash2 :size="14" />删除所选连接</Button>
      <div class="guide-zoom"><Button variant="ghost" size="sm" aria-label="缩小画布" :disabled="zoom <= 0.5" @click="setZoom(zoom - 0.1)"><Minus :size="14" /></Button><Button variant="ghost" size="sm" aria-label="重置画布缩放" @click="setZoom(1)">{{ Math.round(zoom * 100) }}%</Button><Button variant="ghost" size="sm" aria-label="放大画布" :disabled="zoom >= 1.5" @click="setZoom(zoom + 0.1)"><Plus :size="14" /></Button></div>
    </div>
  </section>
</template>
