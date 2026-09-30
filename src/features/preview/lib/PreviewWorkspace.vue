<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { Box, Scan, CodeXml, MousePointer2, Move, ZoomIn, ZoomOut, Maximize, Focus, Layers, FileBox, Upload, Grid2X2, CircleHelp } from '@lucide/vue'
import { useProjectStore } from '../../../domain/project'
const ModelScene = defineAsyncComponent(() => import('./ModelScene.vue'))
const store = useProjectStore()
const emit = defineEmits<{ import: [] }>()
const doc = computed(() => store.active)
const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const resetKey = ref(0)
const panMode = ref(false)
const dragging = ref(false)
let start = { x: 0, y: 0, px: 0, py: 0 }
const modes = [{ id:'2d' as const, title:'2D 图层', icon: Scan, label:'2D' }, { id:'3d' as const, title:'3D 模型', icon:Box, label:'3D' }, { id:'gcode' as const, title:'G-code 路径', icon:CodeXml, label:'G代码' }]
const modeTitle = computed(() => modes.find(m => m.id === doc.value?.mode)?.title ?? '预览')
const viewBox = computed(() => { const size=140/zoom.value; return `${50-size/2-pan.value.x} ${50-size/2-pan.value.y} ${size} ${size}` })
const paths = computed(() => Array.from({length: 21}, (_, i) => 1+i*4.8))
function fit() { zoom.value=1; pan.value={x:0,y:0}; resetKey.value++ }
function changeZoom(delta: number) { zoom.value=Math.max(0.4, Math.min(5,zoom.value+delta)) }
function pointerDown(e: PointerEvent) { if (!panMode.value && e.button !== 1) return; dragging.value=true; start={x:e.clientX,y:e.clientY,px:pan.value.x,py:pan.value.y}; (e.currentTarget as SVGElement).setPointerCapture(e.pointerId) }
function pointerMove(e: PointerEvent) { if (!dragging.value) return; const el=e.currentTarget as SVGElement; const scale=140/zoom.value/Math.min(el.clientWidth,el.clientHeight); pan.value={x:start.px+(e.clientX-start.x)*scale,y:start.py+(e.clientY-start.y)*scale} }
watch(() => doc.value?.id, fit)
</script>
<template>
  <div class="preview-layout">
    <nav class="mode-rail" aria-label="预览模式">
      <button v-for="mode in modes" :key="mode.id" :class="{ selected:doc?.mode===mode.id }" :disabled="!doc" :aria-label="mode.title" :aria-pressed="doc?.mode===mode.id" :title="mode.title" @click="store.setMode(mode.id)"><component :is="mode.icon" :size="21" :stroke-width="1.7"/><span>{{ mode.label }}</span></button>
      <div class="rail-divider"/>
      <button :disabled="!doc || doc.mode==='3d'" :class="{ selected:panMode }" aria-label="平移工具" title="平移画布" @click="panMode=!panMode"><Move :size="19"/><span>平移</span></button>
      <button :disabled="!doc" aria-label="适应画布" title="适应画布" @click="fit"><Focus :size="19"/><span>适应</span></button>
      <span class="rail-bottom" title="滚轮缩放 · 平移工具拖动 · 3D 鼠标旋转"><CircleHelp :size="18"/></span>
    </nav>
    <section class="preview-main">
      <div class="viewport-toolbar"><div><span class="view-icon"><component :is="doc?.mode==='3d' ? Box : doc?.mode==='gcode' ? CodeXml : Layers" :size="15"/></span><strong>{{ modeTitle }}</strong></div><div><span v-if="doc?.demo" class="demo-badge">示例数据</span><button class="icon-button" title="重置视图" aria-label="重置视图" @click="fit"><Maximize :size="15"/></button></div></div>
      <div class="viewport" :class="{ 'with-grid':(!doc || doc.params.grid) && (!doc?.demo || doc.mode!=='3d') }">
        <div v-if="doc && doc.mode!=='3d'" class="ruler ruler-horizontal"><span v-for="n in 12" :key="n">{{ (n-2)*10 }}</span></div>
        <div v-if="doc && doc.mode!=='3d'" class="ruler ruler-vertical"><span v-for="n in 10" :key="n">{{ (n-2)*10 }}</span></div>
        <template v-if="doc?.demo">
          <ModelScene v-if="doc.mode==='3d'" :doc="doc" :reset-key="resetKey"/>
          <svg v-else class="board-canvas" :class="{ panning:panMode, dragging }" :viewBox="viewBox" @wheel.prevent="changeZoom($event.deltaY<0 ? 0.1 : -0.1)" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="dragging=false" @pointercancel="dragging=false">
            <defs><pattern id="fill-lines" width="0.9" height="0.9" patternUnits="userSpaceOnUse" :patternTransform="`rotate(${doc.params.layer%2 ? 45 : -45})`"><line x1="0" y1="0" x2="0" y2="0.9" stroke="#649bb0" stroke-width="0.16"/></pattern><mask id="stencil-mask"><rect x="-5" y="-5" width="110" height="110" fill="white"/><g :transform="doc.params.mirror ? 'translate(100 0) scale(-1 1)' : undefined"><rect v-for="(p,i) in doc.apertures" :key="i" :x="p.x-doc.params.compensation" :y="p.y-doc.params.compensation" :width="p.width+2*doc.params.compensation" :height="p.height+2*doc.params.compensation" :rx="p.round ? 2 : 0" fill="black"/></g></mask></defs>
            <g v-if="doc.mode==='2d'">
              <rect v-if="doc.params.outline" x="0" y="0" width="100" height="100" fill="none" stroke="#7e8df5" stroke-width="0.22"/>
              <g :opacity="doc.params.opacity/100" :transform="doc.params.mirror ? 'translate(100 0) scale(-1 1)' : undefined"><rect v-for="(p,i) in doc.apertures" :key="i" :x="p.x" :y="p.y" :width="p.width" :height="p.height" :rx="p.round ? 2 : 0.14" fill="#9ac8cb" stroke="#c7f0e5" stroke-width="0.06"/></g>
              <g fill="none" stroke="#586579" stroke-width="0.12" stroke-dasharray="0.7 0.7"><path d="M 45 50 H 55 M 50 45 V 55"/><path d="M 0 104 V 110 M 100 104 V 110 M 0 108 H 41 M 59 108 H 100"/><path d="M -4 0 H -10 M -4 100 H -10 M -8 0 V 41 M -8 59 V 100"/></g>
              <g fill="#92a0b5" font-size="2.1" font-family="monospace"><text x="50" y="108.8" text-anchor="middle">100.00 mm</text><text x="-8" y="50" text-anchor="middle" transform="rotate(-90 -8 50)">100.00 mm</text></g>
              <g stroke="#8597ac" stroke-width="0.14"><path d="M -2 0 H 2 M 0 -2 V 2"/></g>
            </g>
            <g v-else>
              <rect x="-5" y="-5" width="110" height="110" fill="url(#fill-lines)" mask="url(#stencil-mask)"/><rect x="-5" y="-5" width="110" height="110" fill="none" stroke="#e2a761" stroke-width="0.5"/><rect x="-4.3" y="-4.3" width="108.6" height="108.6" fill="none" stroke="#c87c4d" stroke-width="0.3"/>
              <g :transform="doc.params.mirror ? 'translate(100 0) scale(-1 1)' : undefined"><rect v-for="(p,i) in doc.apertures" :key="i" :x="p.x-doc.params.compensation" :y="p.y-doc.params.compensation" :width="p.width+2*doc.params.compensation" :height="p.height+2*doc.params.compensation" :rx="p.round ? 2 : 0" fill="none" stroke="#eca967" stroke-width="0.2"/></g>
              <g v-if="doc.params.showTravel" stroke="#bf84f2" stroke-width="0.16" stroke-dasharray="1 0.7"><path v-for="(y,i) in paths" :key="i" :d="`M -3 ${y} L 103 ${100-y}`"/></g>
            </g>
          </svg>
          <div class="viewport-top-info">{{ doc.mode==='gcode' ? `路径演示 · 第 ${doc.params.layer} 层` : doc.mode==='3d' ? '透视视图' : '顶视图 · TOP' }}<span class="info-divider"/>{{ doc.mode==='3d' ? `${doc.params.thickness.toFixed(2)} mm 厚度` : '单位：mm' }}</div>
          <div class="axis-widget"><span class="axis-y">Y</span><span class="axis-x">X</span><i/></div>
          <div class="canvas-hint">{{ doc.mode==='3d' ? '拖动旋转 · 滚轮缩放 · 右键平移' : '滚轮缩放 · 选择平移工具拖动画布' }}</div>
          <div v-if="doc.mode==='gcode'" class="toolpath-legend"><span><i style="background:#eca967"/>轮廓</span><span><i style="background:#649bb0"/>填充</span><span><i style="background:#bf84f2"/>空走</span></div>
          <div v-if="doc.mode!=='3d'" class="zoom-controls"><button aria-label="缩小" @click="changeZoom(-0.1)"><ZoomOut :size="16"/></button><span>{{ Math.round(zoom*100) }}%</span><button aria-label="放大" @click="changeZoom(0.1)"><ZoomIn :size="16"/></button><i/><button aria-label="缩放适应画布" @click="fit"><Maximize :size="14"/></button></div>
        </template>
        <div v-else-if="doc" class="preview-empty imported-empty"><div class="empty-icon"><FileBox :size="33" :stroke-width="1.3"/></div><h2>{{ doc.name }}</h2><div class="file-summary"><span>{{ doc.files.length }} 个文件</span><span>{{ doc.files.filter(f=>f.role.includes('paste')).length }} 个锡膏层</span></div><div class="imported-layers"><div v-for="file in doc.files.filter(f=>f.role!=='other')" :key="file.name"><Layers :size="14"/><span>{{ file.name }}</span><b>{{ file.role==='outline' ? '板框' : file.role==='top-paste' ? '顶层锡膏' : '底层锡膏' }}</b></div></div><button class="outline-button" @click="store.openDemo()">打开示例</button></div>
        <div v-else class="preview-empty"><div class="empty-icon"><Layers :size="36" :stroke-width="1.3"/></div><h2>导入gerber</h2><button class="primary-button" @click="emit('import')"><Upload :size="15"/>导入文件</button><button class="text-button" @click="store.openDemo()">打开示例</button></div>
      </div>
      <div class="viewport-status"><span><MousePointer2 :size="12"/>{{ doc?.mode==='3d' ? '轨道控制' : panMode ? '平移模式' : '查看模式' }}</span><span v-if="doc?.demo">{{ doc.apertures.length }} 个开孔<span class="status-divider">|</span>{{ doc.width }} × {{ doc.height }} mm</span><span class="status-right"><Grid2X2 :size="12"/>毫米</span></div>
    </section>
  </div>
</template>
