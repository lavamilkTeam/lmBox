<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Button, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Slider, Switch, Tabs, TabsList, TabsTrigger, TabsContent } from '../../../../../../ui/shadcn'
import { Undo2, Redo2, SlidersHorizontal, Trash2, RotateCcw, Download } from '@lucide/vue'
import { useProjectStore } from '../../../domain/project'
import type { DesignSettings, ExportFormat, ObjectEdit, Optimization } from '../../../../../../contracts'
import { HelpTip } from '../../../../../../ui/help-tip'
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
  <Tabs v-else-if="doc" v-model="tab" class="parameter-tabs">
    <div class="panel-heading"><span><SlidersHorizontal :size="15"/>编辑与生成</span><div class="edit-history"><Button variant="ghost" size="icon" class="icon-button" aria-label="撤销编辑" title="撤销" :disabled="!doc.editing.past.length" @click="store.undo()"><Undo2 :size="15"/></Button><Button variant="ghost" size="icon" class="icon-button" aria-label="重做编辑" title="重做" :disabled="!doc.editing.future.length" @click="store.undo(true)"><Redo2 :size="15"/></Button></div></div>
    <TabsList class="editor-tabs" aria-label="编辑分类"><TabsTrigger v-for="t in [{id:'edit',name:'开孔编辑'},{id:'model',name:'外框与底板'},{id:'opt',name:'打印优化'}] as const" :key="t.id" :value="t.id">{{ t.name }}</TabsTrigger></TabsList>
    <div class="parameter-content editor-content">
      <section class="parameter-section">
        <label class="field-label">预览图层</label><Select :model-value="doc.selectedLayer" @update:model-value="store.selectLayer(String($event))"><SelectTrigger class="layer-picker" aria-label="预览图层"><SelectValue/></SelectTrigger><SelectContent><SelectItem v-for="option in doc.files.map(f=>({label:f.name,value:f.name}))" :key="option.value" :value="option.value || '__bounds__'" :disabled="'disabled' in option && Boolean(option.disabled)">{{ option.label }}</SelectItem></SelectContent></Select>
        <p v-if="store.activeLayer?.diagnostic" class="field-help layer-diagnostic">{{ store.activeLayer.diagnostic.line ? `第 ${store.activeLayer.diagnostic.line} 行：` : '' }}{{ store.activeLayer.diagnostic.message }}</p>
        <div class="switch-row"><span>水平镜像</span><Switch aria-label="水平镜像" :model-value="doc.params.mirror" @update:model-value="store.update('mirror',$event)"/></div>
      </section>
      <TabsContent value="edit" class="editor-tab-content">
        <section class="parameter-section">
          <h3>当前选中 <HelpTip label="开孔编辑说明"><p>左侧单击或拖动框选，Shift 可追加选择。参数按所选图形分别应用，原始文件保持不变。</p><p>多选时只覆盖本次改动的字段；缩放和旋转以每个图形中心为基准。</p></HelpTip><span class="selection-count">{{ selected.length }} 个图形</span></h3>
          <div class="edit-actions"><Button variant="outline" size="sm" class="outline-button" @click="store.setMode('2d');store.setSelection(store.allObjects())">全选</Button><Button variant="outline" size="sm" class="outline-button" :disabled="!selected.length" @click="store.setSelection([])">清空选择</Button></div>
          <div class="field-grid">
            <NumberField label="X 偏移" :value="transform.dx" :min="-500" :max="500" :disabled="!selected.length" @change="transformValue('dx',$event)"/>
            <NumberField label="Y 偏移" :value="transform.dy" :min="-500" :max="500" :disabled="!selected.length" @change="transformValue('dy',$event)"/>
            <NumberField label="宽度缩放" :value="transform.scaleX*100" :min="10" :max="300" :step="1" unit="%" :disabled="!selected.length" @change="transformValue('scaleX',$event/100)"/>
            <NumberField label="高度缩放" :value="transform.scaleY*100" :min="10" :max="300" :step="1" unit="%" :disabled="!selected.length" @change="transformValue('scaleY',$event/100)"/>
            <NumberField label="旋转角度" :value="transform.rotation" :min="-360" :max="360" :step="1" unit="°" :disabled="!selected.length" @change="transformValue('rotation',$event)"/>
            <NumberField label="局部补偿" :value="transform.compensation" :min="-.3" :max=".5" :step=".01" :disabled="!selected.length" @change="transformValue('compensation',$event)"/>
          </div>
          <Button size="sm" class="primary-button full-button" :disabled="!selected.length || !Object.keys(changed).length" @click="store.editSelection(changed)">应用变换</Button>
          <div class="edit-actions"><Button variant="outline" size="sm" class="outline-button" :disabled="!selected.length" @click="store.editSelection({deleted:true})"><Trash2 :size="13"/>删除所选</Button><Button variant="outline" size="sm" class="outline-button" :disabled="!selected.length" @click="store.editSelection({},true)"><RotateCcw :size="13"/>恢复原图</Button></div>
          <div class="switch-row"><span>显示已删除图形</span><Switch aria-label="显示已删除图形" v-model="doc.editing.showDeleted"/></div>
        </section>
        <section class="parameter-section"><h3>显示设置</h3><div class="switch-row"><span>显示板框</span><Switch aria-label="显示板框" :model-value="doc.params.outline" @update:model-value="store.update('outline',$event)"/></div><div class="switch-row"><span>显示网格</span><Switch aria-label="显示网格" :model-value="doc.params.grid" @update:model-value="store.update('grid',$event)"/></div><label class="field-label">图层不透明度 <span>{{ doc.params.opacity }}%</span></label><Slider aria-label="图层不透明度" :model-value="[doc.params.opacity]" :min="10" :max="100" @update:model-value="store.update('opacity',$event?.[0] ?? doc.params.opacity)"/></section>
      </TabsContent>
      <TabsContent value="model" class="editor-tab-content">
        <section class="parameter-section"><h3>模型与板框<HelpTip label="模型与板框说明"><p v-if="!doc.editing.outlineLayer">未选择板框：定位槽按锡膏图形的矩形范围计算。生成匹配 PCB 的底板请指定板框图层。</p><p>独立边宽叠加在统一外扩边距上。随形模式请将独立边宽和四角尺寸设为 0。</p></HelpTip></h3>
          <label class="field-label">生成对象</label><Select :model-value="design.kind" @update:model-value="setDesign('kind',$event as DesignSettings['kind'])"><SelectTrigger class="parameter-select" aria-label="生成对象"><SelectValue/></SelectTrigger><SelectContent><SelectItem v-for="option in [{label:'锡膏钢网',value:'stencil'},{label:'PCB 定位底板',value:'base'}]" :key="option.value" :value="option.value || '__bounds__'" :disabled="'disabled' in option && Boolean(option.disabled)">{{ option.label }}</SelectItem></SelectContent></Select>
          <label class="field-label">板框图层</label><Select :model-value="doc.editing.outlineLayer || '__bounds__'" @update:model-value="store.selectOutline($event==='__bounds__'?'':String($event))"><SelectTrigger class="parameter-select" aria-label="板框图层"><SelectValue/></SelectTrigger><SelectContent><SelectItem v-for="option in [{label:'按图形范围',value:''},...doc.files.filter(f=>f.ir && f.name!==doc!.selectedLayer).map(f=>({label:f.name,value:f.name}))]" :key="option.value" :value="option.value || '__bounds__'" :disabled="'disabled' in option && Boolean(option.disabled)">{{ option.label }}</SelectItem></SelectContent></Select>
          <label class="field-label">外框形状</label><Select :model-value="design.frame" @update:model-value="setDesign('frame',$event as DesignSettings['frame'])"><SelectTrigger class="parameter-select" aria-label="外框形状"><SelectValue/></SelectTrigger><SelectContent><SelectItem v-for="option in [{label:'矩形',value:'bounds'},{label:'随板框形状',value:'outline',disabled:!doc.editing.outlineLayer}]" :key="option.value" :value="option.value || '__bounds__'" :disabled="'disabled' in option && Boolean(option.disabled)">{{ option.label }}</SelectItem></SelectContent></Select>
          <NumberField label="模板厚度" :value="doc.params.thickness" :min=".05" :max="3" :step=".05" @change="store.update('thickness',$event)"/>
          <NumberField label="外扩边距" :value="doc.params.margin" :min="1" :max="30" :step="1" @change="store.update('margin',$event)"/>
          <div v-if="design.frame==='bounds'" class="field-grid"><NumberField v-for="[key,label] in extras" :key="key" :label="label" :value="design[key]" :min="0" :max="30" :step="1" @change="setDesign(key,$event)"/></div>
        </section>
        <section v-if="design.frame==='bounds'" class="parameter-section"><h3>外框四角</h3><div class="field-grid"><div v-for="[key,label] in corners" :key="key"><NumberField :label="label" :value="design[key]" :min="0" :max="20" @change="setDesign(key,$event)"/><Select :model-value="design.cornerStyles?.[key.slice(-2) as 'TL'|'TR'|'BL'|'BR'] ?? design.cornerStyle" @update:model-value="setCornerStyle(key,$event as 'round'|'chamfer')"><SelectTrigger class="parameter-select" :aria-label="`${label}处理方式`"><SelectValue/></SelectTrigger><SelectContent><SelectItem v-for="option in [{label:'R 圆角',value:'round'},{label:'C 倒角',value:'chamfer'}]" :key="option.value" :value="option.value || '__bounds__'" :disabled="'disabled' in option && Boolean(option.disabled)">{{ option.label }}</SelectItem></SelectContent></Select></div></div></section>
        <section v-if="design.kind==='base'" class="parameter-section"><h3>定位与取件<HelpTip label="定位与取件说明">槽宽和斜口设为 0 时关闭。卸板槽位于右侧，斜口从定位槽上缘向外扩张。</HelpTip></h3><div class="field-grid"><NumberField label="PCB 厚度" :value="design.boardThickness" :min=".2" :max="10" @change="setDesign('boardThickness',$event)"/><NumberField label="定位间隙" :value="design.clearance" :min="0" :max="2" :step=".05" @change="setDesign('clearance',$event)"/><NumberField label="底板厚度" :value="design.floor" :min=".2" :max="10" @change="setDesign('floor',$event)"/><NumberField label="卸板槽宽" :value="design.slotWidth" :min="0" :max="20" @change="setDesign('slotWidth',$event)"/><NumberField label="取件斜口" :value="design.chamfer" :min="0" :max="2" @change="setDesign('chamfer',$event)"/></div></section>
      </TabsContent>
      <TabsContent v-if="opt" value="opt" class="editor-tab-content">
        <section class="parameter-section"><h3>优化范围<HelpTip v-if="scope==='selected'" label="优化范围说明">仅修改选中的 {{ selected.length }} 个图形，其他图形不变。</HelpTip></h3><Select :model-value="scope" @update:model-value="scope=$event as typeof scope"><SelectTrigger class="parameter-select" aria-label="优化范围"><SelectValue/></SelectTrigger><SelectContent><SelectItem v-for="option in [{label:'整层默认参数',value:'all'},{label:`当前选中（${selected.length}）`,value:'selected',disabled:!selected.length}]" :key="option.value" :value="option.value || '__bounds__'" :disabled="'disabled' in option && Boolean(option.disabled)">{{ option.label }}</SelectItem></SelectContent></Select><div class="field-grid"><NumberField label="开孔缩放" :value="opt.scale" :min="10" :max="200" :step="1" unit="%" @change="opt!.scale=$event"/><NumberField label="内孔圆角" :value="opt.rounding" :min="0" :max="2" :step=".01" @change="opt!.rounding=$event"/></div></section>
        <section class="parameter-section">
          <h3>XY 平面孔形<HelpTip v-if="opt.xyMode && opt.xyMode!=='off'" label="XY 平面孔形说明"><p v-if="opt.xyMode==='whole'">整个焊盘：X {{ opt.xyScaleX ?? 80 }}%，Y {{ opt.xyScaleY ?? 120 }}%，中心不变。</p>
            <p v-else>顶端 X {{ opt.xyScaleX ?? 80 }}%，上半部 Y {{ opt.xyScaleY ?? 120 }}%。{{ opt.xyMode==='opposed' ? `底端 X ${200-(opt.xyScaleX ?? 80)}%，下半部 Y ${200-(opt.xyScaleY ?? 120)}%。左右两侧从底端到顶端连续渐变。` : '下半部保持原形，上半部宽度从中心 100% 渐变到顶端比例。' }}</p>
            <p>以每个焊盘包围框中心为基准；上方为画布 +Y，横向为 X。应用后二维孔形和三维开孔同步变化，可与板厚方向喇叭口叠加。</p></HelpTip></h3>
          <label class="field-label">XY 缩放方式</label>
          <Select :model-value="opt.xyMode ?? 'off'" @update:model-value="opt.xyMode=$event as Optimization['xyMode']"><SelectTrigger class="parameter-select" aria-label="XY 缩放方式"><SelectValue/></SelectTrigger><SelectContent><SelectItem v-for="option in [{label:'关闭',value:'off'},{label:'仅上半部变化',value:'upper'},{label:'整个焊盘缩放',value:'whole'},{label:'上下半部反向变化',value:'opposed'}]" :key="option.value" :value="option.value || '__bounds__'" :disabled="'disabled' in option && Boolean(option.disabled)">{{ option.label }}</SelectItem></SelectContent></Select>
          <template v-if="opt.xyMode && opt.xyMode!=='off'">
            <div class="field-grid">
              <NumberField label="XY 横向比例" :value="opt.xyScaleX ?? 80" :min="10" :max="opt.xyMode==='opposed'?199:200" :step="1" unit="%" @change="opt!.xyScaleX=$event"/>
              <NumberField label="XY 纵向比例" :value="opt.xyScaleY ?? 120" :min="10" :max="opt.xyMode==='opposed'?199:200" :step="1" unit="%" @change="opt!.xyScaleY=$event"/>
            </div>
          </template>
        </section>
        <section class="parameter-section"><h3>板厚方向喇叭口<HelpTip label="板厚方向喇叭口说明">板厚方向：上口 {{ opt.taper }}%，贴板下口 {{ opt.inverseTaper ? 200-opt.taper : 100 }}%。{{ opt.inverseTaper ? '上口增加多少，下口就减少多少；比例必须小于 200%。' : '下口尺寸保持不变，只扩大上口。' }}二维虚线显示上口；选中后可点“查看所选孔壁”放大三维细节。</HelpTip></h3><NumberField label="喇叭口比例" :value="opt.taper" :min="100" :max="opt.inverseTaper ? 199 : 200" :step="1" unit="%" @change="opt!.taper=$event"/><div class="switch-row"><span>反比缩放</span><Switch aria-label="反比缩放" :model-value="opt.inverseTaper ?? false" @update:model-value="opt.inverseTaper=$event"/></div></section>
        <section class="parameter-section"><div class="switch-row"><span>密孔错排<HelpTip label="密孔错排说明">相邻矩形孔沿长轴交替偏移；非矩形孔保留原位置。先错排，再圆角或开网格。</HelpTip></span><Switch aria-label="密孔错排" v-model="opt.stagger"/></div><div v-if="opt.stagger" class="field-grid"><NumberField label="密孔间隙阈值" :value="opt.gap" :min=".05" :max="3" :step=".05" @change="opt!.gap=$event"/><NumberField label="交错位移" :value="opt.staggerOffset" :min="0" :max="50" :step="1" unit="%" @change="opt!.staggerOffset=$event"/><NumberField label="错排缩小" :value="opt.staggerShrink" :min="0" :max="70" :step="1" unit="%" @change="opt!.staggerShrink=$event"/></div></section>
        <section class="parameter-section"><div class="switch-row"><span>大孔开网格</span><Switch aria-label="大孔开网格" v-model="opt.grid"/></div><div v-if="opt.grid" class="field-grid"><NumberField label="大孔边长阈值" :value="opt.gridThreshold" :min=".2" :max="20" @change="opt!.gridThreshold=$event"/><NumberField label="网格开孔上限" :value="opt.gridCell" :min=".2" :max="10" @change="opt!.gridCell=$event"/><NumberField label="网格筋宽" :value="opt.gridWeb" :min=".1" :max="2" @change="opt!.gridWeb=$event"/></div></section>
        <section class="parameter-section"><NumberField label="整层开孔补偿" :value="doc.params.compensation" :min="-.3" :max=".5" :step=".01" @change="store.update('compensation',$event)"><template #help><HelpTip label="整层开孔补偿说明">单边补偿：正值扩大，负值缩小；叠加在局部编辑结果上。</HelpTip></template></NumberField><Button size="sm" class="primary-button full-button" :disabled="scope==='selected' && !selected.length" @click="store.applyOptimization(opt,scope==='selected')">{{ scope==='selected'?'优化所选图形':'应用整层优化' }}</Button><Button variant="ghost" size="sm" class="text-button full-button" :disabled="!selected.length" @click="store.editSelection({optimization:undefined})">清除所选局部优化</Button></section>
      </TabsContent>
      <section v-if="doc.model.mesh" class="parameter-section board-info"><h3>当前模型</h3><dl><dt>模型尺寸</dt><dd>{{ (doc.model.mesh.summary.bounds[1]![0]!-doc.model.mesh.summary.bounds[0]![0]!).toFixed(2) }} × {{ (doc.model.mesh.summary.bounds[1]![1]!-doc.model.mesh.summary.bounds[0]![1]!).toFixed(2) }} mm</dd><dt>开孔数量</dt><dd>{{ doc.model.mesh.summary.holeCount }}</dd><dt>网格三角面</dt><dd>{{ doc.model.mesh.summary.triangleCount }}</dd><dt>体积</dt><dd>{{ doc.model.mesh.summary.volume.toFixed(2) }} mm³</dd></dl></section>
    </div>
    <div class="editor-export"><Button variant="outline" size="sm" class="outline-button" :disabled="doc.model.status!=='ready' || props.exporting" @click="store.setMode('3d')">查看 3D</Button><Button v-for="format in ['stl','svg','dxf'] as const" :key="format" class="outline-button" :disabled="doc.model.status!=='ready' || props.exporting" @click="emit('export',format)" size="sm"><Download :size="12"/>{{ format.toUpperCase() }}</Button><span v-if="props.exporting" role="status">正在导出…</span></div>
  </Tabs>
</template>
