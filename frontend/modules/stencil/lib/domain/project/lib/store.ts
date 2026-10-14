import { computed, markRaw, ref } from 'vue'
import { defineStore } from 'pinia'
import type { DesignSettings, ObjectEdit, Optimization, GraphicsIr, PreviewRequest, PreviewResult } from '../../../../../../contracts'
import type { Aperture, BoardDocument, LayerFile, LogEntry, Parameters, ViewMode } from './types'

import { defaultDesign, defaultEdit, snapshot, checkpoint, restore } from './editing'

const defaults = (): Parameters => ({ side: 'top', grid: true, outline: true, mirror: false, opacity: 90, thickness: 0.2, margin: 5, compensation: 0, layerHeight: 0.1, nozzle: 0.4, speed: 30, temperature: 200, bedTemperature: 55, showTravel: false, layer: 1 })
// The fixed demo uses only dark circle/rectangle flashes. Both previews
// consume that same sample; this is not a manufacturing geometry converter.
function exampleApertures(ir: GraphicsIr): Aperture[] {
  const shapes = new Map(ir.apertures.map(a => [a.code, a.shape]))
  return ir.objects.map(obj => {
    if (obj.kind !== 'flash' || obj.polarity !== 'dark' || ir.stepAndRepeat) throw new Error('示例图形不支持模板预览。')
    const shape = shapes.get(obj.aperture)
    if (!shape || (shape.type !== 'circle' && shape.type !== 'rectangle') || shape.holeDiameter) throw new Error('示例孔径不支持模板预览。')
    const width = shape.type === 'circle' ? shape.diameter : shape.width
    const height = shape.type === 'circle' ? shape.diameter : shape.height
    return { x: obj.at.x-width/2, y: obj.at.y-height/2, width, height, round: shape.type === 'circle' }
  })
}
export const useProjectStore = defineStore('stencil-project', () => {
  const documents = ref<BoardDocument[]>([])
  const activeId = ref('')
  const active = computed(() => documents.value.find(d => d.id === activeId.value))
  const activeLayer = computed(() => active.value?.files.find(file => file.name === active.value?.selectedLayer))
  const activeIr = computed(() => activeLayer.value?.ir ?? active.value?.ir)
  const activeEdits = computed(() => active.value?.editing.layers[active.value.selectedLayer] ?? [])
  let sequence = 0
  let initialized = false
  function log(doc: BoardDocument, message: string, level: LogEntry['level'] = 'info') {
    doc.logs.push({ id: ++sequence, time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), level, message })
    if (doc.logs.length > 300) doc.logs.shift()
  }
  function add(name: string, files: LayerFile[], demo = false, ir?: GraphicsIr) {
    const params = defaults()
    if (!files.some(f => f.role === 'top-paste') && files.some(f => f.role === 'bottom-paste')) params.side = 'bottom'
    const selectedLayer = files.find(f=>f.ir && f.role===`${params.side}-paste`) ?? files.find(f=>f.ir) ?? files[0]
    const doc: BoardDocument = { id: crypto.randomUUID(), name, demo, mode: '2d', dirty: false, files, params, logs: [], width: demo ? 100 : null, height: demo ? 100 : null, apertures: demo && ir ? exampleApertures(ir) : [], ir, editing:{selected:[],layers:{},design:defaultDesign(),outlineLayer:files.find(f=>f.role==='outline' && f.ir)?.name ?? '',past:[],future:[],showDeleted:false}, model:{revision:0,jobId:'',status:'idle',error:''}, selectedLayer:selectedLayer?.name ?? '', view:{zoom:1,panX:0,panY:0} }
    log(doc, demo ? '已打开示例板。' : `已读取 ${name}，${files.filter(f=>f.ir).length} / ${files.length} 个图层已解析。`, demo || files.some(f=>f.ir) ? 'success' : 'warning')
    for (const file of files) if(file.diagnostic) log(doc, `${file.name}${file.diagnostic.line ? ` 第 ${file.diagnostic.line} 行` : ''}：${file.diagnostic.message}`, 'warning')
    documents.value.push(doc); activeId.value = doc.id
    return doc.id
  }
  function initialize(ir: GraphicsIr) {
    if (initialized) return
    initialized = true
    if (!documents.value.length) openDemo(ir)
  }
  function openDemo(ir: GraphicsIr) {
    const existing = documents.value.find(d => d.demo)
    if (existing) { activeId.value = existing.id; return }
    add('示例板 · 100 × 100', [{ name: 'Demo_TopPaste.GTP', role: 'top-paste', size: 0 }, { name: 'Demo_Outline.GKO', role: 'outline', size: 0 }], true, ir)
  }
  function activate(id: string) { if (documents.value.some(d => d.id === id)) activeId.value = id }
  function close(id: string) {
    const i = documents.value.findIndex(d => d.id === id)
    if (i < 0) return
    documents.value.splice(i, 1)
    if (activeId.value === id) activeId.value = documents.value[Math.min(i, documents.value.length - 1)]?.id ?? ''
  }
  function setMode(mode: ViewMode) { if (active.value) active.value.mode = mode }
  function selectLayer(name:string) {
    const doc=active.value
    const file=doc?.files.find(f=>f.name===name)
    if(!doc || !file || doc.selectedLayer===name) return
    invalidateModel(doc);doc.editing.selected=[];doc.selectedLayer=name;doc.view={zoom:1,panX:0,panY:0}
    if(file.role==='top-paste') doc.params.side='top'
    if(file.role==='bottom-paste') doc.params.side='bottom'
  }
  function update<K extends keyof Parameters>(key: K, value: Parameters[K]) {
    const doc = active.value
    if (!doc || doc.params[key] === value) return
    if(['thickness','margin','compensation','mirror'].includes(key)) checkpoint(doc)
    doc.params[key] = value; doc.dirty = true
    if(['thickness','margin','compensation','mirror'].includes(key)) invalidateModel(doc)
    if(key==='side') { const layer=doc.files.find(f=>f.role===`${value}-paste`);if(layer) selectLayer(layer.name) }
    if (key === 'thickness' || key === 'layerHeight') doc.params.layer = Math.min(doc.params.layer, Math.max(1, Math.ceil(doc.params.thickness / doc.params.layerHeight)))
  }
  function reset() { if (active.value) { checkpoint(active.value);active.value.editing.design=defaultDesign();active.value.editing.layers={};active.value.editing.selected=[];active.value.params = defaults(); invalidateModel(active.value); active.value.dirty = true; log(active.value, '已恢复默认参数。') } }
  function invalidateModel(doc:BoardDocument) {
    doc.model={revision:doc.model.revision+1,jobId:'',status:'idle',error:''}
  }
  function retryModel() { if(active.value) invalidateModel(active.value) }
  function beginModel():PreviewRequest|undefined {
    const doc=active.value, ir=activeIr.value
    if(!doc || doc.demo || !ir) return
    const jobId=crypto.randomUUID()
    doc.model={revision:doc.model.revision,jobId,status:'building',error:''}
    log(doc,'正在生成三维模板。')
    return modelRequest(doc,ir,jobId)
  }
  function modelRequest(doc:BoardDocument,ir:GraphicsIr,jobId:string):PreviewRequest {
    const {thickness,margin,compensation,mirror}=doc.params
    return {protocolVersion:'1',projectId:doc.id,jobId,inputRevision:doc.model.revision,ir,settings:{thickness,margin,compensation,mirror,design:JSON.parse(JSON.stringify(doc.editing.design)) as DesignSettings},edits:JSON.parse(JSON.stringify(doc.editing.layers[doc.selectedLayer] ?? [])) as ObjectEdit[],outline:doc.files.find(f=>f.name===doc.editing.outlineLayer)?.ir}
  }
  function matchingModel(request:PreviewRequest) {
    return documents.value.find(d=>d.id===request.projectId && d.model.revision===request.inputRevision && d.model.jobId===request.jobId && d.model.status==='building')
  }
  function completeModel(request:PreviewRequest,result:PreviewResult) {
    const doc=matchingModel(request)
    if(!doc || result.projectId!==request.projectId || result.jobId!==request.jobId || result.inputRevision!==request.inputRevision) return
    doc.model.mesh=markRaw(result.mesh);doc.model.status='ready'
    log(doc,`三维模板已生成，${result.mesh.summary.holeCount} 个开孔。`,'success')
  }
  function failModel(request:PreviewRequest,message:string,cancelled=false) {
    const doc=matchingModel(request)
    if(!doc) return
    doc.model.status=cancelled?'cancelled':'error';doc.model.error=message
    log(doc,message,'warning')
  }
  function setSelection(ids:string[],mode:'replace'|'add'|'toggle'='replace') {
    const doc=active.value,ir=activeIr.value
    if(!doc || doc.demo || !ir)return
    const repeat=ir.stepAndRepeat ?? {xCount:1,yCount:1}
    const valid=ids.filter(id=>{if(!/^(0|[1-9]\d*):(0|[1-9]\d*):(0|[1-9]\d*)$/.test(id))return false;const [y,x,i]=id.split(':').map(Number);return y!==undefined && x!==undefined && i!==undefined && Number.isInteger(y) && Number.isInteger(x) && Number.isInteger(i) && y>=0 && y<repeat.yCount && x>=0 && x<repeat.xCount && ir.objects[i]?.polarity==='dark'})
    const selected=new Set(mode==='replace'?[]:doc.editing.selected)
    for(const id of valid) {if(mode==='toggle' && selected.has(id))selected.delete(id);else selected.add(id)}
    doc.editing.selected=[...selected]
  }
  function allObjects() {
    const ir=activeIr.value;if(!ir)return []
    const r=ir.stepAndRepeat ?? {xCount:1,yCount:1};const ids:string[]=[]
    if(r.xCount*r.yCount*ir.objects.length>20000)return ids
    const deleted=new Set(activeEdits.value.filter(e=>e.deleted).map(e=>e.id))
    for(let y=0;y<r.yCount;y++)for(let x=0;x<r.xCount;x++)ir.objects.forEach((o,i)=>{if(o.polarity==='dark')ids.push(`${y}:${x}:${i}`)})
    return active.value?.editing.showDeleted ? ids : ids.filter(id=>!deleted.has(id))
  }
  function editSelection(change:Partial<Omit<ObjectEdit,'id'>>,reset=false) {
    const doc=active.value;if(!doc || !doc.editing.selected.length)return
    checkpoint(doc)
    const edits=new Map(activeEdits.value.map(e=>[e.id,e]))
    for(const id of doc.editing.selected) {
      if(reset)edits.delete(id)
      else edits.set(id,{...(edits.get(id) ?? defaultEdit(id)),...change,id})
    }
    doc.editing.layers[doc.selectedLayer]=[...edits.values()];doc.dirty=true;invalidateModel(doc)
  }
  function updateDesign<K extends keyof DesignSettings>(key:K,value:DesignSettings[K]) {
    const doc=active.value;if(!doc || doc.editing.design[key]===value)return
    checkpoint(doc);doc.editing.design[key]=value;doc.dirty=true;invalidateModel(doc)
  }
  function applyOptimization(value:Optimization,selected:boolean) {
    if(selected)editSelection({optimization:{...value}})
    else updateDesign('optimization',{...value})
  }
  function selectOutline(name:string) {
    const doc=active.value;if(!doc || doc.editing.outlineLayer===name)return
    checkpoint(doc);doc.editing.outlineLayer=name;doc.dirty=true;invalidateModel(doc)
  }
  function undo(redo=false) {
    const doc=active.value;if(!doc)return
    const from=redo?doc.editing.future:doc.editing.past,to=redo?doc.editing.past:doc.editing.future
    const previous=from.pop();if(!previous)return
    to.push(snapshot(doc));restore(doc,previous);doc.dirty=true;invalidateModel(doc)
  }
  function exportRequest() {
    const doc=active.value,ir=activeIr.value
    if(!doc || doc.demo || !ir || doc.model.status!=='ready')return
    return modelRequest(doc,ir,crypto.randomUUID())
  }
  return { initialize, activeEdits, setSelection, allObjects, editSelection, updateDesign, applyOptimization, selectOutline, undo, exportRequest, beginModel, completeModel, failModel, retryModel, documents, activeId, active, activeLayer, activeIr, selectLayer, add, activate, close, openDemo, setMode, update, reset, log }
})
