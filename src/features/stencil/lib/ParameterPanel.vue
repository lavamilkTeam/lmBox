<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { NSelect, NSlider, NSwitch } from 'naive-ui'
import { Undo2, Redo2, SlidersHorizontal, Trash2, RotateCcw, Download } from '@lucide/vue'
import { useProjectStore } from '../../../domain/project'
import type { DesignSettings, ExportFormat, ObjectEdit, Optimization } from '../../../contracts'
import NumberField from './NumberField.vue'
import DemoParameters from './DemoParameters.vue'
const props=defineProps<{exporting?:boolean}>()
const emit=defineEmits<{export:[format:ExportFormat]}>()
const store=useProjectStore(),doc=computed(()=>store.active)
const tab=ref<'edit'|'model'|'opt'>('edit')
const scope=ref<'selected'|'all'>('all')
const selected=computed(()=>doc.value?.editing.selected ?? [])
// A fresh selection means the next optimization should target those objects.
// Users can still explicitly choose the whole layer for this selection.
watch([()=>doc.value?.id,()=>doc.value?.selectedLayer,()=>selected.value.join(',')],()=>{
  scope.value=selected.value.length?'selected':'all'
},{immediate:true})
const design=computed(()=>doc.value!.editing.design)
const transform=reactive({dx:0,dy:0,scaleX:1,scaleY:1,rotation:0,compensation:0})
const changed=ref<Partial<ObjectEdit>>({})
const opt=ref<Optimization>()
watch([()=>doc.value?.id,()=>doc.value?.selectedLayer,()=>selected.value.join(','),()=>doc.value?.model.revision],()=>{
  const current=store.activeEdits.find(e=>e.id===selected.value[0])
  Object.assign(transform,{dx:0,dy:0,scaleX:1,scaleY:1,rotation:0,compensation:0},current)
  changed.value={}
},{immediate:true})
const appliedOptimization=computed(()=>scope.value==='selected'
  ? store.activeEdits.find(e=>e.id===selected.value[0])?.optimization ?? doc.value?.editing.design.optimization
  : doc.value?.editing.design.optimization)
watch([()=>doc.value?.id,()=>doc.value?.selectedLayer,()=>selected.value.join(','),scope,()=>JSON.stringify(appliedOptimization.value)],()=>{
  const local=scope.value==='selected'?store.activeEdits.find(e=>e.id===selected.value[0])?.optimization:undefined
  if(doc.value)opt.value={...(local ?? doc.value.editing.design.optimization)}
},{immediate:true})
function transformValue(key:keyof typeof transform,value:number) {transform[key]=value;changed.value={...changed.value,[key]:value}}
const extras=[['extraLeft','左侧加宽'],['extraRight','右侧加宽'],['extraTop','上侧加宽'],['extraBottom','下侧加宽']] as const
const corners=[['cornerTL','左上角'],['cornerTR','右上角'],['cornerBL','左下角'],['cornerBR','右下角']] as const
function setCornerStyle(key:'cornerTL'|'cornerTR'|'cornerBL'|'cornerBR',value:'round'|'chamfer') {const style=design.value.cornerStyle;setDesign('cornerStyles',{TL:style,TR:style,BL:style,BR:style,...design.value.cornerStyles,[key.slice(-2)]:value})}
function setDesign<K extends keyof DesignSettings>(key:K,value:DesignSettings[K]) {store.updateDesign(key,value)}
</script>
<template>
  <DemoParameters v-if="doc?.demo"/>
  <template v-else-if="doc">
    <div class="panel-heading"><span><SlidersHorizontal :size="15"/>编辑与生成</span><div class="edit-history"><button class="icon-button" aria-label="撤销编辑" title="撤销" :disabled="!doc.editing.past.length" @click="store.undo()"><Undo2 :size="15"/></button><button class="icon-button" aria-label="重做编辑" title="重做" :disabled="!doc.editing.future.length" @click="store.undo(true)"><Redo2 :size="15"/></button></div></div>
    <div class="editor-tabs" role="tablist" aria-label="编辑分类"><button v-for="t in [{id:'edit',name:'开孔编辑'},{id:'model',name:'外框与底板'},{id:'opt',name:'打印优化'}] as const" :key="t.id" role="tab" :aria-selected="tab===t.id" :class="{active:tab===t.id}" @click="tab=t.id">{{ t.name }}</button></div>
    <div class="parameter-content editor-content">
      <section class="parameter-section">
        <label class="field-label">预览图层</label><NSelect class="layer-picker" aria-label="预览图层" :value="doc.selectedLayer" :options="doc.files.map(f=>({label:f.name,value:f.name}))" size="small" @update:value="store.selectLayer"/>
        <p v-if="store.activeLayer?.diagnostic" class="field-help layer-diagnostic">{{ store.activeLayer.diagnostic.line ? `第 ${store.activeLayer.diagnostic.line} 行：` : '' }}{{ store.activeLayer.diagnostic.message }}</p>
        <div class="switch-row"><span>水平镜像</span><NSwitch size="small" :value="doc.params.mirror" @update:value="store.update('mirror',$event)"/></div>
      </section>
      <template v-if="tab==='edit'">
        <section class="parameter-section">
          <h3>当前选中 <span class="selection-count">{{ selected.length }} 个图形</span></h3>
          <div class="edit-actions"><button class="outline-button" @click="store.setMode('2d');store.setSelection(store.allObjects())">全选</button><button class="outline-button" :disabled="!selected.length" @click="store.setSelection([])">清空选择</button></div>
          <p class="field-help">左侧单击或拖动框选，Shift 可追加选择。参数按所选图形分别应用，原始文件保持不变。</p>
          <div class="field-grid">
            <NumberField label="X 偏移" :value="transform.dx" :min="-500" :max="500" :disabled="!selected.length" @change="transformValue('dx',$event)"/>
            <NumberField label="Y 偏移" :value="transform.dy" :min="-500" :max="500" :disabled="!selected.length" @change="transformValue('dy',$event)"/>
            <NumberField label="宽度缩放" :value="transform.scaleX*100" :min="10" :max="300" :step="1" unit="%" :disabled="!selected.length" @change="transformValue('scaleX',$event/100)"/>
            <NumberField label="高度缩放" :value="transform.scaleY*100" :min="10" :max="300" :step="1" unit="%" :disabled="!selected.length" @change="transformValue('scaleY',$event/100)"/>
            <NumberField label="旋转角度" :value="transform.rotation" :min="-360" :max="360" :step="1" unit="°" :disabled="!selected.length" @change="transformValue('rotation',$event)"/>
            <NumberField label="局部补偿" :value="transform.compensation" :min="-.3" :max=".5" :step=".01" :disabled="!selected.length" @change="transformValue('compensation',$event)"/>
          </div>
          <button class="primary-button full-button" :disabled="!selected.length || !Object.keys(changed).length" @click="store.editSelection(changed)">应用变换</button>
          <div class="edit-actions"><button class="outline-button" :disabled="!selected.length" @click="store.editSelection({deleted:true})"><Trash2 :size="13"/>删除所选</button><button class="outline-button" :disabled="!selected.length" @click="store.editSelection({},true)"><RotateCcw :size="13"/>恢复原图</button></div>
          <div class="switch-row"><span>显示已删除图形</span><NSwitch aria-label="显示已删除图形" size="small" v-model:value="doc.editing.showDeleted"/></div>
          <p class="field-help">多选时只覆盖本次改动的字段；缩放和旋转以每个图形中心为基准。</p>
        </section>
        <section class="parameter-section"><h3>显示设置</h3><div class="switch-row"><span>显示板框</span><NSwitch size="small" :value="doc.params.outline" @update:value="store.update('outline',$event)"/></div><div class="switch-row"><span>显示网格</span><NSwitch size="small" :value="doc.params.grid" @update:value="store.update('grid',$event)"/></div><label class="field-label">图层不透明度 <span>{{ doc.params.opacity }}%</span></label><NSlider :value="doc.params.opacity" :min="10" :max="100" @update:value="store.update('opacity',$event)"/></section>
      </template>
      <template v-if="tab==='model'">
        <section class="parameter-section"><h3>模型与板框</h3>
          <label class="field-label">生成对象</label><NSelect aria-label="生成对象" :value="design.kind" :options="[{label:'锡膏钢网',value:'stencil'},{label:'PCB 定位底板',value:'base'}]" size="small" @update:value="setDesign('kind',$event)"/>
          <label class="field-label">板框图层</label><NSelect aria-label="板框图层" :value="doc.editing.outlineLayer" :options="[{label:'按图形范围',value:''},...doc.files.filter(f=>f.ir && f.name!==doc!.selectedLayer).map(f=>({label:f.name,value:f.name}))]" size="small" @update:value="store.selectOutline"/>
          <label class="field-label">外框形状</label><NSelect aria-label="外框形状" :value="design.frame" :options="[{label:'矩形',value:'bounds'},{label:'随板框形状',value:'outline',disabled:!doc.editing.outlineLayer}]" size="small" @update:value="setDesign('frame',$event)"/>
          <NumberField label="模板厚度" :value="doc.params.thickness" :min=".05" :max="3" :step=".05" @change="store.update('thickness',$event)"/>
          <NumberField label="外扩边距" :value="doc.params.margin" :min="1" :max="30" :step="1" @change="store.update('margin',$event)"/>
          <div v-if="design.frame==='bounds'" class="field-grid"><NumberField v-for="[key,label] in extras" :key="key" :label="label" :value="design[key]" :min="0" :max="30" :step="1" @change="setDesign(key,$event)"/></div>
          <p v-if="!doc.editing.outlineLayer" class="field-help">未选择板框：定位槽按锡膏图形的矩形范围计算。生成匹配 PCB 的底板请指定板框图层。</p>
          <p class="field-help">独立边宽叠加在统一外扩边距上。随形模式请将独立边宽和四角尺寸设为 0。</p>
        </section>
        <section v-if="design.frame==='bounds'" class="parameter-section"><h3>外框四角</h3><div class="field-grid"><div v-for="[key,label] in corners" :key="key"><NumberField :label="label" :value="design[key]" :min="0" :max="20" @change="setDesign(key,$event)"/><NSelect :aria-label="`${label}处理方式`" :value="design.cornerStyles?.[key.slice(-2) as 'TL'|'TR'|'BL'|'BR'] ?? design.cornerStyle" :options="[{label:'R 圆角',value:'round'},{label:'C 倒角',value:'chamfer'}]" size="small" @update:value="setCornerStyle(key,$event)"/></div></div></section>
        <section v-if="design.kind==='base'" class="parameter-section"><h3>定位与取件</h3><div class="field-grid"><NumberField label="PCB 厚度" :value="design.boardThickness" :min=".2" :max="10" @change="setDesign('boardThickness',$event)"/><NumberField label="定位间隙" :value="design.clearance" :min="0" :max="2" :step=".05" @change="setDesign('clearance',$event)"/><NumberField label="底板厚度" :value="design.floor" :min=".2" :max="10" @change="setDesign('floor',$event)"/><NumberField label="卸板槽宽" :value="design.slotWidth" :min="0" :max="20" @change="setDesign('slotWidth',$event)"/><NumberField label="取件斜口" :value="design.chamfer" :min="0" :max="2" @change="setDesign('chamfer',$event)"/></div><p class="field-help">槽宽和斜口设为 0 时关闭。卸板槽位于右侧，斜口从定位槽上缘向外扩张。</p></section>
      </template>
      <template v-if="tab==='opt' && opt">
        <section class="parameter-section"><h3>优化范围</h3><NSelect aria-label="优化范围" v-model:value="scope" :options="[{label:'整层默认参数',value:'all'},{label:`当前选中（${selected.length}）`,value:'selected',disabled:!selected.length}]" size="small"/><p class="field-help">{{ scope==='selected' ? `仅修改选中的 ${selected.length} 个图形，其他图形不变。` : '修改整层默认参数；已有局部优化的图形保留局部设置。' }}</p><div class="field-grid"><NumberField label="开孔缩放" :value="opt.scale" :min="10" :max="200" :step="1" unit="%" @change="opt!.scale=$event"/><NumberField label="内孔圆角" :value="opt.rounding" :min="0" :max="2" :step=".01" @change="opt!.rounding=$event"/><NumberField label="喇叭口比例" :value="opt.taper" :min="100" :max="opt.inverseTaper ? 199 : 200" :step="1" unit="%" @change="opt!.taper=$event"/></div><div class="switch-row"><span>反比缩放</span><NSwitch aria-label="反比缩放" size="small" :value="opt.inverseTaper ?? false" @update:value="opt.inverseTaper=$event"/></div><p class="field-help">板厚方向：上口 {{ opt.taper }}%，贴板下口 {{ opt.inverseTaper ? 200-opt.taper : 100 }}%。{{ opt.inverseTaper ? '上口增加多少，下口就减少多少；比例必须小于 200%。' : '下口尺寸保持不变，只扩大上口。' }}二维虚线显示上口；选中后可点“查看所选孔壁”放大三维细节。</p></section>
        <section class="parameter-section"><div class="switch-row"><span>密孔错排</span><NSwitch aria-label="密孔错排" size="small" v-model:value="opt.stagger"/></div><div v-if="opt.stagger" class="field-grid"><NumberField label="密孔间隙阈值" :value="opt.gap" :min=".05" :max="3" :step=".05" @change="opt!.gap=$event"/><NumberField label="交错位移" :value="opt.staggerOffset" :min="0" :max="50" :step="1" unit="%" @change="opt!.staggerOffset=$event"/><NumberField label="错排缩小" :value="opt.staggerShrink" :min="0" :max="70" :step="1" unit="%" @change="opt!.staggerShrink=$event"/></div><p class="field-help">相邻矩形孔沿长轴交替偏移；非矩形孔保留原位置。先错排，再圆角或开网格。</p></section>
        <section class="parameter-section"><div class="switch-row"><span>大孔开网格</span><NSwitch aria-label="大孔开网格" size="small" v-model:value="opt.grid"/></div><div v-if="opt.grid" class="field-grid"><NumberField label="大孔边长阈值" :value="opt.gridThreshold" :min=".2" :max="20" @change="opt!.gridThreshold=$event"/><NumberField label="网格开孔上限" :value="opt.gridCell" :min=".2" :max="10" @change="opt!.gridCell=$event"/><NumberField label="网格筋宽" :value="opt.gridWeb" :min=".1" :max="2" @change="opt!.gridWeb=$event"/></div></section>
        <section class="parameter-section"><NumberField label="整层开孔补偿" :value="doc.params.compensation" :min="-.3" :max=".5" :step=".01" @change="store.update('compensation',$event)"/><p class="field-help">单边补偿：正值扩大，负值缩小；叠加在局部编辑结果上。</p><button class="primary-button full-button" :disabled="scope==='selected' && !selected.length" @click="store.applyOptimization(opt,scope==='selected')">{{ scope==='selected'?'优化所选图形':'应用整层优化' }}</button><button class="text-button full-button" :disabled="!selected.length" @click="store.editSelection({optimization:undefined})">清除所选局部优化</button></section>
      </template>
      <section v-if="doc.model.mesh" class="parameter-section board-info"><h3>当前模型</h3><dl><dt>模型尺寸</dt><dd>{{ (doc.model.mesh.summary.bounds[1]![0]!-doc.model.mesh.summary.bounds[0]![0]!).toFixed(2) }} × {{ (doc.model.mesh.summary.bounds[1]![1]!-doc.model.mesh.summary.bounds[0]![1]!).toFixed(2) }} mm</dd><dt>开孔数量</dt><dd>{{ doc.model.mesh.summary.holeCount }}</dd><dt>网格三角面</dt><dd>{{ doc.model.mesh.summary.triangleCount }}</dd><dt>体积</dt><dd>{{ doc.model.mesh.summary.volume.toFixed(2) }} mm³</dd></dl></section>
    </div>
    <div class="editor-export"><button class="outline-button" :disabled="doc.model.status!=='ready' || props.exporting" @click="store.setMode('3d')">查看 3D</button><button v-for="format in ['stl','svg','dxf'] as const" :key="format" class="outline-button" :disabled="doc.model.status!=='ready' || props.exporting" @click="emit('export',format)"><Download :size="12"/>{{ format.toUpperCase() }}</button><span v-if="props.exporting" role="status">正在导出…</span></div>
  </template>
</template>
