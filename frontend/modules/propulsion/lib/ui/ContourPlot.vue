<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ points: { x: number; radius: number }[] }>()
const length = computed(() => Math.max(...props.points.map(p => p.x)))
const radius = computed(() => Math.max(...props.points.map(p => p.radius)))
const scale = computed(() => Math.min(600 / length.value, 240 / radius.value))
const line = (sign: number) => props.points.map(p => `${70 + p.x * scale.value},${290 + sign * p.radius * scale.value}`).join(' ')
const xEnd = computed(() => 70 + length.value * scale.value)
</script>
<template>
  <svg class="design-plot" viewBox="0 0 760 580" role="img" aria-label="喷管扩张段轴对称型面，轴向与径向等比例">
    <defs><pattern id="nozzle-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M 30 0 L 0 0 0 30" fill="none" stroke="#252525" stroke-width="1" /></pattern></defs>
    <rect width="760" height="580" fill="url(#nozzle-grid)" />
    <line x1="40" y1="290" x2="710" y2="290" class="plot-axis" />
    <polyline :points="line(-1)" class="plot-contour" /><polyline :points="line(1)" class="plot-contour" />
    <line x1="70" y1="40" x2="70" y2="540" class="plot-dimension" /><line :x1="xEnd" y1="40" :x2="xEnd" y2="540" class="plot-dimension" />
    <text x="70" y="24" text-anchor="middle">喉部</text><text :x="xEnd" y="24" text-anchor="middle">出口</text>
    <text x="70" y="560" text-anchor="middle">0</text><text :x="xEnd" y="560" text-anchor="middle">{{ (length * 1000).toFixed(3) }} mm</text>
    <text x="700" y="282">x</text><text x="20" y="560">轴向</text>
  </svg>
</template>
