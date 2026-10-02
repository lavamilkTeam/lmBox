<script setup lang="ts">
import { computed, useId } from 'vue'
import type { RenderedIr } from './render'

const props = defineProps<{ geometry: RenderedIr }>()
const id = `ir-${useId().replace(/[^a-zA-Z0-9_-]/g, '-')}`
const extent = computed(() => ({
  x: props.geometry.bounds.minX - 1,
  y: props.geometry.bounds.minY - 1,
  width: props.geometry.bounds.maxX - props.geometry.bounds.minX + 2,
  height: props.geometry.bounds.maxY - props.geometry.bounds.minY + 2,
}))
</script>

<template>
  <g class="ir-layer">
    <defs>
      <mask v-for="(operation, i) in geometry.operations" :id="`${id}-${i}`" :key="i" v-bind="extent" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" style="mask-type:luminance">
        <g :transform="operation.transform">
          <path v-for="(path, j) in operation.paths" :key="j" :d="path.d" :transform="path.transform" :fill="path.fill ?? 'none'" :stroke="path.stroke" :stroke-width="path.strokeWidth" :fill-rule="path.fillRule" :stroke-linecap="path.strokeLinecap" :stroke-linejoin="path.strokeLinejoin"/>
        </g>
      </mask>
      <mask :id="`${id}-layer`" v-bind="extent" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" style="mask-type:luminance">
        <rect v-for="(operation, i) in geometry.operations" :key="i" v-bind="extent" :fill="operation.polarity === 'dark' ? 'white' : 'black'" :mask="`url(#${id}-${i})`"/>
      </mask>
    </defs>
    <rect class="ir-paste" v-bind="extent" fill="#9ac8cb" :mask="`url(#${id}-layer)`"/>
  </g>
</template>
