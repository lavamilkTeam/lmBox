<script setup lang="ts">
defineProps<{ inner: number; outer: number; label: string }>()
</script>
<template><figure class="passage-figure"><svg viewBox="0 0 260 260" role="img" :aria-label="label + '单元流道截面'">
  <circle cx="130" cy="130" r="88" fill="#333" stroke="#e5e5e5" stroke-width="2" />
  <circle v-if="inner > 0" cx="130" cy="130" :r="88 * inner / outer" fill="#101010" stroke="#e5e5e5" stroke-width="2" />
  <path d="M20 130H240M130 20V240" class="plot-axis" />
  <text x="130" y="246" text-anchor="middle">外径 {{ (outer * 1000).toFixed(4) }} mm</text>
</svg><figcaption>{{ label }} · {{ inner > 0 ? '环隙' : '圆孔' }}</figcaption></figure></template>
