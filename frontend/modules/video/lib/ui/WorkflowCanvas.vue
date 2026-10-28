<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button, Card } from '../../../../ui/shadcn'
import type { VideoNode } from './types'
const props = defineProps<{ nodes: VideoNode[]; selected: string; locked: boolean }>()
const emit = defineEmits<{ select: [id: string]; move: [id: string, x: number, y: number]; connect: [source: string, output: number, target: string, input: string]; remove: [id: string]; disconnect: [id: string, input: string] }>()
const viewport = ref<HTMLElement>(), zoom = ref(1)
const source = ref<{ id: string; output: number } | null>(null)
const drag = ref<{ id: string; pointer: number; clientX: number; clientY: number; x: number; y: number } | null>(null)
const width = computed(() => Math.max(1400, ...props.nodes.map(node => node.x + 310)))
const nodeHeight = (node: VideoNode) => 48 + Math.max(node.inputs.length, node.outputs.length, 1) * 30
const height = computed(() => Math.max(900, ...props.nodes.map(node => node.y + nodeHeight(node) + 80)))
const lines = computed(() => props.nodes.flatMap(node => node.inputs.flatMap((input, index) => {
  if (!input.connection) return []
  const a = props.nodes.find(item => item.id === input.connection!.nodeId)
  if (!a) return []
  const x1 = a.x + 260, y1 = a.y + 59 + input.connection.outputIndex * 30, x2 = node.x, y2 = node.y + 59 + index * 30
  const bend = Math.max(60, Math.abs(x2 - x1) / 2)
  return [{ key: `${node.id}:${input.name}`, target: node.id, input: input.name, label: `${a.title} → ${node.title}.${input.name}`, path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}` }]
})))
function insertionPoint() {
  const x = (viewport.value?.scrollLeft ?? 0) / zoom.value + 40
  let y = (viewport.value?.scrollTop ?? 0) / zoom.value + 40
  while (props.nodes.some(node => Math.abs(node.x - x) < 275 && Math.abs(node.y - y) < nodeHeight(node) + 24)) y += 100
  return { x, y }
}
defineExpose({ insertionPoint })
function begin(event: PointerEvent, node: VideoNode) {
  if (event.button !== 0) return
  emit('select', node.id)
  drag.value = { id: node.id, pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: node.x, y: node.y }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function move(event: PointerEvent) {
  const current = drag.value
  if (current && current.pointer === event.pointerId) emit('move', current.id, current.x + (event.clientX - current.clientX) / zoom.value, current.y + (event.clientY - current.clientY) / zoom.value)
}
function keyboardMove(event: KeyboardEvent, node: VideoNode) {
  const delta: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }
  const step = delta[event.key]
  if (step) { event.preventDefault(); emit('move', node.id, node.x + step[0], node.y + step[1]) }
}
function finish(id: string, input: string) { if (source.value) { emit('connect', source.value.id, source.value.output, id, input); source.value = null } }
function setZoom(value: number) { zoom.value = Math.min(1.5, Math.max(0.5, Math.round(value * 10) / 10)) }
</script>
<template>
  <section class="video-board" aria-label="ComfyUI画布" @keydown.esc="source = null">
    <div ref="viewport" class="video-viewport" @pointermove="move">
      <div :style="{ width: `${width * zoom}px`, height: `${height * zoom}px` }">
        <div class="video-surface" :style="{ width: `${width}px`, height: `${height}px`, transform: `scale(${zoom})` }" @click.self="source = null">
          <svg class="video-connections" :width="width" :height="height" aria-label="节点连线">
            <g v-for="line in lines" :key="line.key">
              <path class="video-edge" :d="line.path" />
              <path class="video-edge-hit" :d="line.path" role="button" tabindex="0" :aria-label="`断开：${line.label}`" @click="!locked && emit('disconnect', line.target, line.input)" @keydown.enter.prevent="!locked && emit('disconnect', line.target, line.input)" @keydown.delete.prevent="!locked && emit('disconnect', line.target, line.input)" />
            </g>
          </svg>
          <Card v-for="node in nodes" :key="node.id" class="video-node" :class="{ 'is-selected': selected === node.id }" :data-node-id="node.id" :aria-label="node.title" :style="{ left: `${node.x}px`, top: `${node.y}px`, height: `${nodeHeight(node)}px` }" @click="emit('select', node.id)">
            <div class="video-node-header">
              <Button variant="ghost" size="sm" class="video-node-title" :aria-label="`移动 ${node.title} ${node.id}`" @pointerdown="begin($event, node)" @pointerup="drag = null" @pointercancel="drag = null" @lostpointercapture="drag = null" @keydown="keyboardMove($event, node)">{{ node.title }}</Button>
              <Button variant="ghost" size="icon-xs" :disabled="locked" :aria-label="`删除节点 ${node.id}`" @click.stop="emit('remove', node.id)">×</Button>
            </div>
            <div class="video-node-ports">
              <div class="video-inputs"><div v-for="input in node.inputs" :key="input.name" class="video-port-row">
                <Button variant="outline" size="icon-xs" class="video-port" :class="{ 'is-connected': input.connection }" :disabled="locked || input.secret" :aria-label="`节点 ${node.id} 输入 ${input.name}`" :title="`${input.name} · ${input.type}`" @click.stop="finish(node.id, input.name)" />
                <span :title="input.name">{{ input.name }}</span>
              </div></div>
              <div class="video-outputs"><div v-for="(output, index) in node.outputs" :key="index" class="video-port-row">
                <span :title="output.name">{{ output.name }}</span>
                <Button variant="outline" size="icon-xs" class="video-port" :class="{ 'is-connected': source?.id === node.id && source.output === index }" :disabled="locked" :aria-label="`节点 ${node.id} 输出 ${output.name}`" :title="`${output.name} · ${output.type}`" :aria-pressed="source?.id === node.id && source.output === index" @click.stop="source = { id: node.id, output: index }" />
              </div></div>
            </div>
          </Card>
        </div>
      </div>
    </div>
    <slot />
    <div class="video-zoom">
      <Button v-if="source" variant="outline" size="sm" @click="source = null">取消连线</Button>
      <Button variant="outline" size="sm" aria-label="缩小视频画布" :disabled="zoom <= 0.5" @click="setZoom(zoom - 0.1)">−</Button>
      <Button variant="outline" size="sm" aria-label="重置视频画布缩放" @click="setZoom(1)">{{ Math.round(zoom * 100) }}%</Button>
      <Button variant="outline" size="sm" aria-label="放大视频画布" :disabled="zoom >= 1.5" @click="setZoom(zoom + 0.1)">+</Button>
    </div>
  </section>
</template>
