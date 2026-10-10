<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowUpRight, CircuitBoard, FlaskConical, Wind, Workflow, X, Minus, Plus, Trash2 } from '@lucide/vue'
import type { NodeView, EdgeView } from './types'
const props = defineProps<{ nodes: NodeView[]; edges: EdgeView[]; message: string }>()
const emit = defineEmits<{
  add: [id: string, x: number, y: number]; move: [id: string, x: number, y: number]
  connect: [source: string, target: string]; removeNode: [id: string]; removeEdge: [id: string]; open: [id: string]
}>()
const viewport = ref<HTMLElement>()
const zoom = ref(1)
const source = ref<string | null>(null)
const selectedEdge = ref<string | null>(null)
const dropping = ref(false)
const drag = ref<{ id: string; pointer: number; clientX: number; clientY: number; x: number; y: number } | null>(null)
const cursor = ref({ x: 0, y: 0 })
const width = computed(() => Math.max(1400, ...props.nodes.map(node => node.x + 360)))
const height = computed(() => Math.max(900, ...props.nodes.map(node => node.y + 240)))
const sourceNode = computed(() => props.nodes.find(node => node.id === source.value))
const selected = computed(() => props.edges.find(edge => edge.id === selectedEdge.value))
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
  while (props.nodes.some(node => Math.abs(node.x - baseX) < 260 && Math.abs(node.y - y) < 150)) y += 172
  return { x: baseX, y }
}
defineExpose({ insertionPoint })
function drop(event: DragEvent) {
  dropping.value = false
  const id = event.dataTransfer?.getData('application/x-lmbox-guide-tool')
  if (!id) return
  const p = point(event.clientX, event.clientY)
  emit('add', id, p.x - 124, p.y - 30)
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
  const current = drag.value
  if (current && current.pointer === event.pointerId) emit('move', current.id, current.x + (event.clientX - current.clientX) / zoom.value, current.y + (event.clientY - current.clientY) / zoom.value)
}
function startLink(node: NodeView) {
  source.value = source.value === node.id ? null : node.id
  cursor.value = { x: node.x + 296, y: node.y + 108 }
}
function finishLink(id: string) {
  if (!source.value) return
  emit('connect', source.value, id)
  source.value = null
}
function path(x1: number, y1: number, x2: number, y2: number) {
  const bend = Math.max(64, Math.abs(x2 - x1) / 2)
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
}
const lines = computed(() => props.edges.flatMap(edge => {
  const a = props.nodes.find(node => node.id === edge.source), b = props.nodes.find(node => node.id === edge.target)
  return a && b ? [{ ...edge, label: `${a.label} → ${b.label}`, path: path(a.x + 248, a.y + 108, b.x, b.y + 108) }] : []
}))
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
  <section class="guide-board" aria-label="引导界面" @keydown.esc="source = null; selectedEdge = null">
    <div ref="viewport" class="guide-viewport" :class="{ 'is-dropping': dropping, 'is-connecting': source }" aria-label="流程画布"
      @dragover="dragOver" @dragleave="dropping = false" @drop.prevent="drop" @pointermove="move">
      <div class="guide-scroll-space" :style="{ width: `${width * zoom}px`, height: `${height * zoom}px` }">
        <div class="guide-surface" :style="{ width: `${width}px`, height: `${height}px`, transform: `scale(${zoom})` }" @click.self="source = null; selectedEdge = null">
          <svg class="guide-connections" :width="width" :height="height" aria-label="功能连接">
            <defs><marker id="guide-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
            <g v-for="line in lines" :key="line.id" :class="{ 'is-selected': selectedEdge === line.id }">
              <path class="guide-edge" :d="line.path" marker-end="url(#guide-arrow)" />
              <path class="guide-edge-hit" :d="line.path" role="button" tabindex="0" :aria-label="`连接：${line.label}`" :aria-pressed="selectedEdge === line.id"
                @click.stop="selectedEdge = line.id" @keydown.enter.prevent="selectedEdge = line.id" @keydown.space.prevent="selectedEdge = line.id"
                @keydown.delete.prevent="emit('removeEdge', line.id)" @keydown.backspace.prevent="emit('removeEdge', line.id)" />
            </g>
            <path v-if="sourceNode" class="guide-edge guide-edge-preview" :d="path(sourceNode.x + 248, sourceNode.y + 108, cursor.x, cursor.y)" />
          </svg>
          <article v-for="node in nodes" :key="node.id" class="guide-node" :data-kind="node.kind" :data-node-id="node.id" :aria-label="node.label"
            :class="{ 'is-link-source': source === node.id, 'is-moving': drag?.id === node.id }" :style="{ left: `${node.x}px`, top: `${node.y}px` }">
            <button class="guide-node-heading" :aria-label="`移动${node.label}`" @pointerdown="startMove($event, node)" @pointerup="drag = null" @pointercancel="drag = null" @lostpointercapture="drag = null" @keydown="keyboardMove($event, node)">
              <span class="guide-tool-icon"><CircuitBoard v-if="node.kind === 'electrical'" :size="17" /><FlaskConical v-else-if="node.kind === 'chemistry'" :size="17" /><Wind v-else :size="17" /></span>
              <span><small>{{ node.category }}</small><strong>{{ node.label }}</strong></span>
            </button>
            <button class="guide-node-delete" :aria-label="`移除${node.label}`" @click="removeNode(node.id)"><X :size="13" /></button>
            <p>{{ node.description }}</p>
            <div class="guide-node-bottom"><span>{{ node.available ? '工作区就绪' : '工作区待接入' }}</span><button v-if="node.available" :aria-label="`打开${node.label}`" @click="emit('open', node.id)">打开 <ArrowUpRight :size="13" /></button><span v-else>仅流程编排</span></div>
            <button class="guide-port guide-port-in" :class="{ 'is-ready': source && source !== node.id }" :aria-label="`${node.label}输入端`" :title="`${node.label}输入端`" @click="finishLink(node.id)" />
            <button class="guide-port guide-port-out" :aria-label="`${node.label}输出端`" :title="`${node.label}输出端`" :aria-pressed="source === node.id" @click="startLink(node)" />
          </article>
        </div>
      </div>
      <div v-if="!nodes.length" class="guide-empty"><span class="guide-empty-icon"><Workflow :size="36" :stroke-width="1.3" /></span><h2>从一个功能开始</h2><p>将左侧功能拖到这里，<br />连接不同节点，搭建你的分析流程。</p><span>拖放添加 · 点击端口连接 · 打开功能继续设计</span></div>
    </div>
    <div class="guide-floating-tools">
      <button v-if="source" class="guide-remove-link" @click="source = null">取消连线 <X :size="12" /></button>
      <button v-if="selected" class="guide-remove-link" @click="removeSelected"><Trash2 :size="14" />删除所选连接</button>
      <div class="guide-zoom"><button aria-label="缩小画布" :disabled="zoom <= 0.5" @click="setZoom(zoom - 0.1)"><Minus :size="14" /></button><button aria-label="重置画布缩放" @click="setZoom(1)">{{ Math.round(zoom * 100) }}%</button><button aria-label="放大画布" :disabled="zoom >= 1.5" @click="setZoom(zoom + 0.1)"><Plus :size="14" /></button></div>
    </div>
    <footer class="guide-board-footer"><span role="status">{{ source ? '请选择另一个节点的输入端 · Esc 取消' : message || '就绪 · 画布在当前会话内保留' }}</span><span>连线仅用于流程编排，尚不传递计算数据</span></footer>
  </section>
</template>
