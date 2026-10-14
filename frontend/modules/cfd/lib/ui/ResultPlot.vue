<script setup lang="ts">
import { computed } from 'vue'
import type { UiPlot } from './types'
import { chinese } from './chinese'
const props=defineProps<{plot:UiPlot}>()
const colors=['#7db5f8','#f6bd60','#a5cf85','#d797d6','#75d4cf','#f08c8c','#aaa7fa','#b9c3cc']
const x=(v:number)=>props.plot.xScale==='log'?Math.log10(v):v
const y=(v:number)=>props.plot.yScale==='log'?Math.log10(v):v
const points=computed(()=>props.plot.series.flatMap(s=>s.points).filter(p=>Number.isFinite(x(p[0]))&&Number.isFinite(y(p[1]))))
const bounds=computed(()=>{const xs=points.value.map(p=>x(p[0])),ys=points.value.map(p=>y(p[1]));return {xmin:Math.min(...xs),xmax:Math.max(...xs),ymin:Math.min(...ys),ymax:Math.max(...ys)}})
const px=(v:number)=>60+(x(v)-bounds.value.xmin)/(bounds.value.xmax-bounds.value.xmin||1)*610
const py=(v:number)=>270-(y(v)-bounds.value.ymin)/(bounds.value.ymax-bounds.value.ymin||1)*230
const line=(p:[number,number][])=>p.filter(p=>Number.isFinite(x(p[0]))&&Number.isFinite(y(p[1]))).map(p=>`${px(p[0])},${py(p[1])}`).join(' ')
</script>
<template><section class="cfd-plot"><h3>{{ chinese(plot.title) }}</h3><svg v-if="points.length" viewBox="0 0 720 320" role="img" :aria-label="chinese(plot.title)"><path d="M60 30 V270 H680" fill="none" stroke="currentColor"/><polyline v-for="(series,index) in plot.series" :key="series.name" :points="line(series.points)" fill="none" :stroke="colors[index%colors.length]" stroke-width="1.5"/><text x="360" y="305" text-anchor="middle">{{ chinese(plot.xLabel) }}</text><text x="16" y="160" transform="rotate(-90 16 160)" text-anchor="middle">{{ chinese(plot.yLabel) }}</text><text x="60" y="286">{{ points[0]?.[0] }}</text><text x="675" y="286" text-anchor="end">{{ points.at(-1)?.[0] }}</text></svg><div class="cfd-plot-legend"><span v-for="(series,index) in plot.series" :key="series.name"><i :style="{background:colors[index%colors.length]}"/>{{ chinese(series.name) }}</span></div></section></template>
