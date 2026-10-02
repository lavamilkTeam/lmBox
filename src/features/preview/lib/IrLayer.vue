<script setup lang="ts">
import { computed, useId } from 'vue'
import type { PathItem, RenderedIr } from './render'

const props = withDefaults(defineProps<{ geometry: RenderedIr; color?:string }>(),{color:'#9ac8cb'})
const id = `ir-${useId().replace(/[^a-zA-Z0-9_-]/g, '-')}`
const operations = computed(() => props.geometry.operations.map((op,index)=>({
  ...op,index,needsMask:op.paths.some(path=>path.fill==='black' || path.stroke==='black'),
})))
const masks = computed(() => operations.value.filter(op=>op.needsMask))
const hasClear = computed(() => operations.value.some(op=>op.polarity==='clear'))
const extent = computed(() => ({
  x: props.geometry.bounds.minX - 1,
  y: props.geometry.bounds.minY - 1,
  width: props.geometry.bounds.maxX - props.geometry.bounds.minX + 2,
  height: props.geometry.bounds.maxY - props.geometry.bounds.minY + 2,
}))
function attributes(path:PathItem,color='white') {
  const paint=(value:string|undefined)=>value==='white'?color:value ?? 'none'
  return {d:path.d,transform:path.transform,fill:paint(path.fill),stroke:paint(path.stroke),
    'stroke-width':path.strokeWidth,'fill-rule':path.fillRule,'stroke-linecap':path.strokeLinecap,'stroke-linejoin':path.strokeLinejoin}
}
</script>

<template>
  <g class="ir-layer">
    <defs>
      <mask v-for="operation in masks" :id="`${id}-${operation.index}`" :key="operation.index" v-bind="extent" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" style="mask-type:luminance">
        <g :transform="operation.transform"><path v-for="(path,j) in operation.paths" :key="j" v-bind="attributes(path)"/></g>
      </mask>
      <mask v-if="hasClear" :id="`${id}-layer`" v-bind="extent" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" style="mask-type:luminance">
        <template v-for="operation in operations" :key="operation.index">
          <rect v-if="operation.needsMask" v-bind="extent" :fill="operation.polarity==='dark'?'white':'black'" :mask="`url(#${id}-${operation.index})`"/>
          <g v-else :transform="operation.transform"><path v-for="(path,j) in operation.paths" :key="j" v-bind="attributes(path,operation.polarity==='dark'?'white':'black')"/></g>
        </template>
      </mask>
    </defs>
    <rect v-if="hasClear" class="ir-paste" v-bind="extent" :fill="color" :mask="`url(#${id}-layer)`"/>
    <g v-else class="ir-paste">
      <template v-for="operation in operations" :key="operation.index">
        <rect v-if="operation.needsMask" v-bind="extent" :fill="color" :mask="`url(#${id}-${operation.index})`"/>
        <g v-else :transform="operation.transform"><path v-for="(path,j) in operation.paths" :key="j" v-bind="attributes(path,color)"/></g>
      </template>
    </g>
  </g>
</template>
