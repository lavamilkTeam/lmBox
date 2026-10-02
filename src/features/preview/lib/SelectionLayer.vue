<script setup lang="ts">
import { computed } from 'vue'
import type { RenderedIr } from './render'
const props=defineProps<{geometry:RenderedIr;selected:string[]}>()
const selection=computed(()=>new Set(props.selected))
</script>
<template>
  <g class="selection-layer">
    <g v-for="op in geometry.operations.filter(o=>o.polarity==='dark')" :key="op.id" :data-object-id="op.id" :data-selected="selection.has(op.id)" :transform="op.transform" :class="{'selected-object':selection.has(op.id),'deleted-object':op.deleted}">
      <path v-for="(p,i) in op.paths.filter(p=>p.fill!=='black' && p.stroke!=='black')" :key="i" :d="p.d" :transform="p.transform" :fill-rule="p.fillRule" :fill="p.fill==='white' ? selection.has(op.id)?'#529af550':op.deleted?'#dc718530':'transparent' : 'none'" :stroke="selection.has(op.id)?'#82b7ff':op.deleted?'#ec8e9f':p.stroke==='white'?'transparent':'none'" :stroke-width="p.strokeWidth ?? (selection.has(op.id)||op.deleted?1.5:0)" :vector-effect="p.strokeWidth?undefined:'non-scaling-stroke'" :stroke-dasharray="op.deleted?'3 2':undefined" :stroke-linecap="p.strokeLinecap" :stroke-linejoin="p.strokeLinejoin"/>
    </g>
  </g>
</template>
