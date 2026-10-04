<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Box, Scan, CodeXml, MousePointer2, Move, ZoomIn, ZoomOut, Maximize, Focus, Layers, FileBox, Upload, Grid2X2 } from '@lucide/vue'
import { useProjectStore } from '../../../domain/project'
import { HelpTip } from '../../../ui/help-tip'
import SelectionLayer from './SelectionLayer.vue'
import IrLayer from './IrLayer.vue'
import { renderIr, type RenderedIr } from './render'
import { topFacePath } from './mesh-outline'
import { observeViewportSize } from '../../../platform/desktop'
const ModelScene = defineAsyncComponent(() => import('./ModelScene.vue'))
const store = useProjectStore()
const emit = defineEmits<{ import: []; demo: []; cancelModel: [] }>()
const doc = computed(() => store.active)
const rendered = computed(() => {
  if (!store.activeIr) return { geometry: undefined, error: '' }
  try { return { geometry: renderIr(store.activeIr), error: '' } }
  catch (error) { return { geometry: undefined, error: error instanceof Error ? error.message : '图形预览失败。' } }
})
// Native contours are the shared contact-plane preview; raw IR remains available while building.
const processed = computed<RenderedIr|undefined>(() => {
  const mesh=doc.value?.model.mesh
  if(!mesh?.objects || !rendered.value.geometry)return
  return {bounds:rendered.value.geometry.bounds,operations:mesh.objects.filter(o=>!o.deleted || doc.value?.editing.showDeleted).map(o=>({
    id:o.id,deleted:o.deleted,polarity:'dark',transform:'',paths:[{d:o.rings.map(r=>'M '+r.map(p=>p.join(' ')).join(' L ')+' Z').join(' '),fill:'white',fillRule:'evenodd'}],
  }))}
})
const displayGeometry=computed(()=>processed.value ?? rendered.value.geometry)
const drawingTransform=computed(()=>`translate(${!processed.value && doc.value?.params.mirror ? geometryBounds.value.minX+geometryBounds.value.maxX : 0} ${flipY.value}) scale(${!processed.value && doc.value?.params.mirror ? -1 : 1} -1)`)
const materialPath=computed(()=>doc.value?.model.mesh?.contours.map(r=>'M '+r.map(p=>p.join(' ')).join(' L ')+' Z').join(' ') ?? '')
const showTopOutline=ref(true)
const topOutline=computed(()=>{
  const mesh=doc.value?.model.mesh,design=doc.value?.editing.design
  if(!mesh || design?.kind!=='stencil')return ''
  const hasTaper=design.optimization.taper!==100 || store.activeEdits.some(e=>!e.deleted && e.optimization && e.optimization.taper!==100)
  return hasTaper ? topFacePath(mesh) : ''
})
const marquee=ref<{x:number;y:number;width:number;height:number}>()
const canvas=ref<SVGSVGElement>()
let selectStart:{x:number;y:number;clientX:number;clientY:number;id?:string;add:boolean}|undefined
function svgPoint(e:PointerEvent) {
  const matrix=canvas.value?.getScreenCTM();if(!matrix)return {x:0,y:0}
  return new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse())
}
function pointerUp(e:PointerEvent) {
  if(selectStart) {
    const moved=Math.hypot(e.clientX-selectStart.clientX,e.clientY-selectStart.clientY)>4
    const ids:string[]=[]
    if(moved) {
      const a={left:Math.min(e.clientX,selectStart.clientX),right:Math.max(e.clientX,selectStart.clientX),top:Math.min(e.clientY,selectStart.clientY),bottom:Math.max(e.clientY,selectStart.clientY)}
      for(const node of canvas.value?.querySelectorAll<SVGGElement>('[data-object-id]') ?? []) {
        const b=node.getBoundingClientRect()
        if(b.width && b.height && b.left<=a.right && b.right>=a.left && b.top<=a.bottom && b.bottom>=a.top)ids.push(node.dataset.objectId!)
      }
    } else if(selectStart.id)ids.push(selectStart.id)
    store.setSelection(ids,selectStart.add?(moved?'add':'toggle'):'replace')
  }
  selectStart=undefined;marquee.value=undefined;dragging.value=false
  if(canvas.value?.hasPointerCapture(e.pointerId))canvas.value.releasePointerCapture(e.pointerId)
}
function keyboard(e:KeyboardEvent) {
  if(e.key==='Escape') {store.setSelection([]);e.preventDefault()}
  if(e.key==='Delete' || e.key==='Backspace') {store.editSelection({deleted:true});e.preventDefault()}
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='a') {store.setSelection(store.allObjects());e.preventDefault()}
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z') {store.undo(e.shiftKey);e.preventDefault()}
}
const outlines = computed(() => doc.value?.files.filter(file=>file.role==='outline' && file.ir && file.name!==doc.value?.selectedLayer).map(file=>{
  try { return {name:file.name,geometry:renderIr(file.ir!),error:''} }
  catch(error) {return {name:file.name,geometry:undefined,error:error instanceof Error?error.message:'板框预览失败。'}}
}) ?? [])
const geometryBounds = computed(() => {
  const all = doc.value?.mode==='2d' ? [rendered.value.geometry,...outlines.value.map(o=>o.geometry)].filter(g=>g!==undefined) : []
  const modelBounds=doc.value?.model.mesh?.summary.bounds
  if(modelBounds?.[0] && modelBounds[1])all.push({operations:[],bounds:{minX:modelBounds[0][0]!,minY:modelBounds[0][1]!,maxX:modelBounds[1][0]!,maxY:modelBounds[1][1]!}})
  if (!all.length || doc.value?.demo) return {minX:0,minY:0,maxX:100,maxY:100}
  return {minX:Math.min(...all.map(g=>g.bounds.minX)),minY:Math.min(...all.map(g=>g.bounds.minY)),maxX:Math.max(...all.map(g=>g.bounds.maxX)),maxY:Math.max(...all.map(g=>g.bounds.maxY))}
})
const flipY = computed(() => geometryBounds.value.minY + geometryBounds.value.maxY)
const canPreview = computed(() => !!doc.value && (doc.value.demo || ((doc.value.mode === '2d' || doc.value.mode === '3d') && !!store.activeIr)))
const zoom = computed({get:()=>doc.value?.view.zoom ?? 1,set:value=>{if(doc.value) doc.value.view.zoom=value}})
const pan = computed({get:()=>({x:doc.value?.view.panX ?? 0,y:doc.value?.view.panY ?? 0}),set:value=>{if(doc.value) {doc.value.view.panX=value.x;doc.value.view.panY=value.y}}})
const viewport = ref<HTMLDivElement>()
const viewportSize = ref({ width: 1, height: 1 })
let stopObserving: (() => void) | undefined
onMounted(() => {
  if (viewport.value) stopObserving = observeViewportSize(viewport.value, (width, height) => {
    viewportSize.value = { width: Math.max(1, width - 23), height: Math.max(1, height - 23) }
  })
})
onBeforeUnmount(() => stopObserving?.())
const resetKey = ref(0)
const focusKey = ref(0)
const panMode = ref(false)
const dragging = ref(false)
let start = { x: 0, y: 0, px: 0, py: 0 }
const modes = [{ id:'2d' as const, title:'2D 图层', icon: Scan, label:'2D' }, { id:'3d' as const, title:'3D 模型', icon:Box, label:'3D' }, { id:'gcode' as const, title:'G-code 路径', icon:CodeXml, label:'G代码' }]
const modeTitle = computed(() => modes.find(m => m.id === doc.value?.mode)?.title ?? '预览')
// Geometry, grid and rulers share one millimetre-to-screen transform.
const pixelsPerMm = computed(() => Math.min(viewportSize.value.width / Math.max(1, (geometryBounds.value.maxX-geometryBounds.value.minX)*1.3+2), viewportSize.value.height / Math.max(1, (geometryBounds.value.maxY-geometryBounds.value.minY)*1.3+2)) * zoom.value)
const bounds = computed(() => {
  const width = viewportSize.value.width / pixelsPerMm.value
  const height = viewportSize.value.height / pixelsPerMm.value
  return { x: (geometryBounds.value.minX+geometryBounds.value.maxX)/2 - width / 2 - pan.value.x, y: flipY.value/2 - height / 2 - pan.value.y, width, height }
})
const viewBox = computed(() => `${bounds.value.x} ${bounds.value.y} ${bounds.value.width} ${bounds.value.height}`)
const gridStep = computed(() => {
  const minimum = 14 / pixelsPerMm.value
  const decade = 10 ** Math.floor(Math.log10(minimum))
  return [1, 2, 5, 10].find(step => step * decade >= minimum)! * decade
})
function ticks(start: number, length: number) {
  const step = gridStep.value
  const first = Math.ceil(start / step)
  const last = Math.floor((start + length) / step)
  return Array.from({ length: last - first + 1 }, (_, offset) => {
    const index = first + offset
    const value = Number((index * step).toFixed(6))
    return { value, major: index % 5 === 0, position: (value - start) * pixelsPerMm.value }
  })
}
const xTicks = computed(() => ticks(bounds.value.x, bounds.value.width))
const yTicks = computed(() => doc.value?.mode==='2d'
  ? ticks(flipY.value-bounds.value.y-bounds.value.height,bounds.value.height).map(tick=>({...tick,position:(flipY.value-tick.value-bounds.value.y)*pixelsPerMm.value}))
  : ticks(bounds.value.y,bounds.value.height))
const paths = computed(() => Array.from({length: 21}, (_, i) => 1+i*4.8))
function fit() { focusKey.value=0; zoom.value=1; pan.value={x:0,y:0}; resetKey.value++ }
function changeZoom(delta: number) { zoom.value=Math.max(0.05, Math.min(30,zoom.value*(delta>0?1.15:1/1.15))) }
function pointerDown(e: PointerEvent) {
  if(e.button!==0 && e.button!==1)return
  canvas.value?.focus();canvas.value?.setPointerCapture(e.pointerId)
  if(panMode.value || e.button===1) {dragging.value=true;start={x:e.clientX,y:e.clientY,px:pan.value.x,py:pan.value.y};return}
  if(doc.value?.demo || doc.value?.mode!=='2d')return
  const p=svgPoint(e)
  selectStart={x:p.x,y:p.y,clientX:e.clientX,clientY:e.clientY,id:(e.target as Element).closest<SVGGElement>('[data-object-id]')?.dataset.objectId,add:e.shiftKey || e.metaKey || e.ctrlKey}
}
function pointerMove(e: PointerEvent) {
  if(selectStart) {const p=svgPoint(e);marquee.value={x:Math.min(p.x,selectStart.x),y:Math.min(p.y,selectStart.y),width:Math.abs(p.x-selectStart.x),height:Math.abs(p.y-selectStart.y)};return}
  if (!dragging.value) return; pan.value={x:start.px+(e.clientX-start.x)/pixelsPerMm.value,y:start.py+(e.clientY-start.y)/pixelsPerMm.value} }
watch(() => [doc.value?.id,doc.value?.selectedLayer], () => {dragging.value=false;selectStart=undefined;marquee.value=undefined;resetKey.value++})
</script>
<template>
  <div class="preview-layout">
    <nav class="mode-rail" aria-label="预览模式">
      <button v-for="mode in modes" :key="mode.id" :class="{ selected:doc?.mode===mode.id }" :disabled="!doc || (!doc.demo && (mode.id==='gcode' || (mode.id==='3d' && !store.activeIr)))" :aria-label="mode.title" :aria-pressed="doc?.mode===mode.id" :title="mode.title" @click="store.setMode(mode.id)"><component :is="mode.icon" :size="21" :stroke-width="1.7"/><span>{{ mode.label }}</span></button>
      <div class="rail-divider"/>
      <button :disabled="!doc || doc.demo" :class="{selected:doc?.mode==='2d' && !panMode}" aria-label="选择工具" @click="store.setMode('2d');panMode=false"><MousePointer2 :size="19"/><span>选择</span></button>
      <button :disabled="!doc || doc.mode==='3d'" :class="{ selected:panMode }" aria-label="平移工具" title="平移画布" @click="panMode=!panMode"><Move :size="19"/><span>平移</span></button>
      <button :disabled="!doc" aria-label="适应画布" title="适应画布" @click="fit"><Focus :size="19"/><span>适应</span></button>
      <span class="rail-bottom"><HelpTip label="预览操作说明">{{ doc?.mode==='3d' ? '拖动旋转 · 滚轮缩放 · 右键平移' : '单击选择 · 拖动框选 · Shift 多选 · 中键平移' }}</HelpTip></span>
    </nav>
    <section class="preview-main">
      <div class="viewport-toolbar"><div><span class="view-icon"><component :is="doc?.mode==='3d' ? Box : doc?.mode==='gcode' ? CodeXml : Layers" :size="15"/></span><strong>{{ modeTitle }}</strong></div><div><button v-if="doc && !doc.demo && doc.editing.selected.length && doc.editing.design.kind==='stencil'" class="text-button" :disabled="doc.model.status!=='ready'" @click="focusKey++;store.setMode('3d')">查看所选孔壁</button><span v-if="doc?.demo" class="demo-badge">示例数据</span><button class="icon-button" title="重置视图" aria-label="重置视图" @click="fit"><Maximize :size="15"/></button></div></div>
      <div ref="viewport" class="viewport">
        <div v-if="canPreview && doc?.mode!=='3d'" class="ruler ruler-horizontal"><span v-for="tick in xTicks" :key="tick.value" :class="{ major:tick.major }" :style="{ left:`${tick.position}px` }"><b v-if="tick.major">{{ tick.value }}</b></span></div>
        <div v-if="canPreview && doc?.mode!=='3d'" class="ruler ruler-vertical"><span v-for="tick in yTicks" :key="tick.value" :class="{ major:tick.major }" :style="{ top:`${tick.position}px` }"><b v-if="tick.major">{{ tick.value }}</b></span></div>
        <template v-if="doc && canPreview">
          <template v-if="doc.mode==='3d'">
            <ModelScene v-if="doc.demo || doc.model.status==='ready'" :doc="doc" :reset-key="resetKey" :focus-key="focusKey"/>
            <div v-else class="preview-empty" :role="doc.model.status==='error' ? 'alert' : 'status'">
              <Box :size="32"/><h2>{{ doc.model.status==='error' ? '模型生成失败' : doc.model.status==='cancelled' ? '已取消生成' : '正在生成三维模板' }}</h2>
              <p>{{ doc.model.error || '正在计算开孔与模板网格…' }}</p>
              <button v-if="doc.model.status==='building'" class="outline-button" @click="emit('cancelModel')">取消生成</button>
              <button v-if="doc.model.status==='error' || doc.model.status==='cancelled'" class="outline-button" @click="store.retryModel">重新生成</button>
            </div>
          </template>
          <svg v-else ref="canvas" tabindex="0" aria-label="图形编辑画布" class="board-canvas" @keydown="keyboard" :class="{ panning:panMode, dragging }" :viewBox="viewBox" @wheel.prevent="changeZoom($event.deltaY<0 ? 0.1 : -0.1)" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="selectStart=undefined;marquee=undefined;dragging=false">
            <g v-if="doc.params.grid" class="preview-grid" aria-hidden="true" pointer-events="none">
              <line v-for="tick in xTicks" :key="`x-${tick.value}`" :x1="tick.value" :x2="tick.value" :y1="bounds.y" :y2="bounds.y+bounds.height" :stroke="tick.major ? '#343a43' : '#1c222a'" stroke-width="1" vector-effect="non-scaling-stroke"/>
              <line v-for="tick in yTicks" :key="`y-${tick.value}`" :y1="doc.mode==='2d' ? flipY-tick.value : tick.value" :y2="doc.mode==='2d' ? flipY-tick.value : tick.value" :x1="bounds.x" :x2="bounds.x+bounds.width" :stroke="tick.major ? '#343a43' : '#1c222a'" stroke-width="1" vector-effect="non-scaling-stroke"/>
            </g>
            <defs><pattern id="fill-lines" width="0.9" height="0.9" patternUnits="userSpaceOnUse" :patternTransform="`rotate(${doc.params.layer%2 ? 45 : -45})`"><line x1="0" y1="0" x2="0" y2="0.9" stroke="#649bb0" stroke-width="0.16"/></pattern><mask id="stencil-mask"><rect x="-5" y="-5" width="110" height="110" fill="white"/><g :transform="doc.params.mirror ? 'translate(100 0) scale(-1 1)' : undefined"><rect v-for="(p,i) in doc.apertures" :key="i" :x="p.x-doc.params.compensation" :y="p.y-doc.params.compensation" :width="p.width+2*doc.params.compensation" :height="p.height+2*doc.params.compensation" :rx="p.round ? 2 : 0" fill="black"/></g></mask></defs>
            <g v-if="doc.mode==='2d'">
              <rect v-if="doc.demo && doc.params.outline" x="0" y="0" width="100" height="100" fill="none" stroke="#7e8df5" stroke-width="0.22"/>
              <g v-if="displayGeometry" :transform="drawingTransform">
                <path v-if="materialPath" :d="materialPath" fill="#17252d" fill-rule="evenodd" stroke="#577785" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none"/>
                <g :opacity="doc.params.opacity/100" pointer-events="none"><IrLayer :geometry="{...displayGeometry,operations:displayGeometry.operations.filter(o=>!o.deleted)}" :color="store.activeLayer?.role==='outline' ? '#8790ee' : undefined"/></g>
                <SelectionLayer v-if="!doc.demo" :geometry="displayGeometry" :selected="doc.editing.selected"/>
                <path v-if="showTopOutline && topOutline" class="top-mouth-outline" :d="topOutline" fill="none" stroke="#ffc46b" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" pointer-events="none"/>
              </g>
              <g v-if="doc.params.outline" :transform="`translate(${doc.params.mirror ? geometryBounds.minX+geometryBounds.maxX : 0} ${flipY}) scale(${doc.params.mirror ? -1 : 1} -1)`" class="outline-layers">
                <template v-for="outline in outlines" :key="outline.name"><IrLayer v-if="outline.geometry" :geometry="outline.geometry" color="#8790ee"/></template>
              </g>
              <g v-if="doc.demo" fill="none" stroke="#586579" stroke-width="0.12" stroke-dasharray="0.7 0.7"><path d="M 45 50 H 55 M 50 45 V 55"/><path d="M 0 104 V 110 M 100 104 V 110 M 0 108 H 41 M 59 108 H 100"/><path d="M -4 0 H -10 M -4 100 H -10 M -8 0 V 41 M -8 59 V 100"/></g>
              <g v-if="doc.demo" fill="#92a0b5" font-size="2.1" font-family="monospace"><text x="50" y="108.8" text-anchor="middle">100.00 mm</text><text x="-8" y="50" text-anchor="middle" transform="rotate(-90 -8 50)">100.00 mm</text></g>
              <g :transform="`translate(0 ${flipY})`" stroke="#8597ac" stroke-width="0.14"><path d="M -2 0 H 2 M 0 -2 V 2"/></g>
            </g>
            <g v-else>
              <rect x="-5" y="-5" width="110" height="110" fill="url(#fill-lines)" mask="url(#stencil-mask)"/><rect x="-5" y="-5" width="110" height="110" fill="none" stroke="#e2a761" stroke-width="0.5"/><rect x="-4.3" y="-4.3" width="108.6" height="108.6" fill="none" stroke="#c87c4d" stroke-width="0.3"/>
              <g :transform="doc.params.mirror ? 'translate(100 0) scale(-1 1)' : undefined"><rect v-for="(p,i) in doc.apertures" :key="i" :x="p.x-doc.params.compensation" :y="p.y-doc.params.compensation" :width="p.width+2*doc.params.compensation" :height="p.height+2*doc.params.compensation" :rx="p.round ? 2 : 0" fill="none" stroke="#eca967" stroke-width="0.2"/></g>
              <g v-if="doc.params.showTravel" stroke="#bf84f2" stroke-width="0.16" stroke-dasharray="1 0.7"><path v-for="(y,i) in paths" :key="i" :d="`M -3 ${y} L 103 ${100-y}`"/></g>
            </g>
            <rect v-if="marquee" v-bind="marquee" fill="#529af52b" stroke="#69aaff" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none"/>
          </svg>
          <div v-if="doc.mode==='2d' && rendered.error" class="preview-empty" role="alert"><p>{{ rendered.error }}</p></div><div v-else-if="doc.mode==='2d' && doc.params.outline && outlines.some(o=>o.error)" class="preview-warning" role="alert">{{ outlines.filter(o=>o.error).map(o=>`${o.name}：${o.error}`).join('；') }}</div>
          <div v-if="!doc.demo && doc.mode==='2d' && doc.model.status!=='ready'" class="edit-progress" :role="doc.model.status==='error'?'alert':'status'">{{ doc.model.status==='error' ? doc.model.error : doc.model.status==='cancelled' ? '已取消计算' : '正在计算编辑结果…' }}<button v-if="doc.model.status==='error' || doc.model.status==='cancelled'" @click="store.retryModel">重试</button></div>
          <div class="viewport-top-info">{{ doc.mode==='gcode' ? `路径演示 · 第 ${doc.params.layer} 层` : doc.mode==='3d' ? (doc.demo ? '透视视图' : doc.editing.design.kind==='base' ? '定位底板 · 透视视图' : '钢网 · 透视视图') : doc.demo ? '顶视图 · TOP' : store.activeLayer?.name ?? doc.name }}<span class="info-divider"/>{{ doc.mode==='3d' ? `${(!doc.demo && doc.editing.design.kind==='base' ? doc.editing.design.floor+doc.editing.design.boardThickness : doc.params.thickness).toFixed(2)} mm 厚度` : '单位：mm' }}</div>
          <div class="axis-widget"><span class="axis-y">Y</span><span class="axis-x">X</span><i/></div>
          <div v-if="doc.mode==='2d' && topOutline" class="mouth-legend"><label><input v-model="showTopOutline" type="checkbox"/>显示上口轮廓</label><HelpTip label="上口轮廓说明">橙色虚线：上口 · 填充图形：贴板下口</HelpTip></div>
          <div v-if="doc.mode==='gcode'" class="toolpath-legend"><span><i style="background:#eca967"/>轮廓</span><span><i style="background:#649bb0"/>填充</span><span><i style="background:#bf84f2"/>空走</span></div>
          <div v-if="doc.mode!=='3d'" class="zoom-controls"><button aria-label="缩小" @click="changeZoom(-0.1)"><ZoomOut :size="16"/></button><span>{{ Math.round(zoom*100) }}%</span><button aria-label="放大" @click="changeZoom(0.1)"><ZoomIn :size="16"/></button><i/><button aria-label="缩放适应画布" @click="fit"><Maximize :size="14"/></button></div>
        </template>
        <div v-else-if="doc" class="preview-empty imported-empty"><div class="empty-icon"><FileBox :size="33" :stroke-width="1.3"/></div><h2>{{ store.activeLayer?.name ?? doc.name }}</h2><p v-if="store.activeLayer?.diagnostic" role="alert">{{ store.activeLayer.diagnostic.message }}</p><div class="file-summary"><span>{{ doc.files.length }} 个文件</span><span>{{ doc.files.filter(f=>f.role.includes('paste')).length }} 个锡膏层</span></div><div class="imported-layers"><div v-for="file in doc.files.filter(f=>f.role!=='other')" :key="file.name"><Layers :size="14"/><span>{{ file.name }}</span><b>{{ file.role==='outline' ? '板框' : file.role==='top-paste' ? '顶层锡膏' : '底层锡膏' }}</b></div></div><button class="outline-button" @click="emit('demo')">打开示例</button></div>
        <div v-else class="preview-empty"><div class="empty-icon"><Layers :size="36" :stroke-width="1.3"/></div><h2>导入gerber</h2><button class="primary-button" @click="emit('import')"><Upload :size="15"/>导入文件</button><button class="text-button" @click="emit('demo')">打开示例</button></div>
      </div>
      <div class="viewport-status"><span><MousePointer2 :size="12"/>{{ doc?.mode==='3d' ? '轨道控制' : panMode ? '平移模式' : `已选 ${doc?.editing.selected.length ?? 0} 个` }}</span><span v-if="doc?.demo">{{ doc.apertures.length }} 个开孔<span class="status-divider">|</span>{{ doc.width }} × {{ doc.height }} mm</span><span v-if="doc && !doc.demo && store.activeIr">{{ store.activeIr.objects.length }} 个图形对象</span><span class="status-right"><Grid2X2 :size="12"/>毫米</span></div>
    </section>
  </div>
</template>
