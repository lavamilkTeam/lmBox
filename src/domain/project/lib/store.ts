import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { GraphicsIr } from '../../../contracts'
import type { Aperture, BoardDocument, LayerFile, LogEntry, Parameters, ViewMode } from './types'

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
export const useProjectStore = defineStore('project', () => {
  const documents = ref<BoardDocument[]>([])
  const activeId = ref('')
  const active = computed(() => documents.value.find(d => d.id === activeId.value))
  const activeLayer = computed(() => active.value?.files.find(file => file.name === active.value?.selectedLayer))
  const activeIr = computed(() => activeLayer.value?.ir ?? active.value?.ir)
  let sequence = 0
  function log(doc: BoardDocument, message: string, level: LogEntry['level'] = 'info') {
    doc.logs.push({ id: ++sequence, time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), level, message })
    if (doc.logs.length > 300) doc.logs.shift()
  }
  function add(name: string, files: LayerFile[], demo = false, ir?: GraphicsIr) {
    const params = defaults()
    if (!files.some(f => f.role === 'top-paste') && files.some(f => f.role === 'bottom-paste')) params.side = 'bottom'
    const selectedLayer = files.find(f=>f.ir && f.role===`${params.side}-paste`) ?? files.find(f=>f.ir) ?? files[0]
    const doc: BoardDocument = { id: crypto.randomUUID(), name, demo, mode: '2d', dirty: false, files, params, logs: [], width: demo ? 100 : null, height: demo ? 100 : null, apertures: demo && ir ? exampleApertures(ir) : [], ir, selectedLayer:selectedLayer?.name ?? '', view:{zoom:1,panX:0,panY:0} }
    log(doc, demo ? '已打开示例板。' : `已读取 ${name}，${files.filter(f=>f.ir).length} / ${files.length} 个图层已解析。`, demo || files.some(f=>f.ir) ? 'success' : 'warning')
    for (const file of files) if(file.diagnostic) log(doc, `${file.name}${file.diagnostic.line ? ` 第 ${file.diagnostic.line} 行` : ''}：${file.diagnostic.message}`, 'warning')
    documents.value.push(doc); activeId.value = doc.id
    return doc.id
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
    doc.selectedLayer=name;doc.view={zoom:1,panX:0,panY:0}
    if(file.role==='top-paste') doc.params.side='top'
    if(file.role==='bottom-paste') doc.params.side='bottom'
  }
  function update<K extends keyof Parameters>(key: K, value: Parameters[K]) {
    const doc = active.value
    if (!doc || doc.params[key] === value) return
    doc.params[key] = value; doc.dirty = true
    if(key==='side') { const layer=doc.files.find(f=>f.role===`${value}-paste`);if(layer) selectLayer(layer.name) }
    if (key === 'thickness' || key === 'layerHeight') doc.params.layer = Math.min(doc.params.layer, Math.max(1, Math.ceil(doc.params.thickness / doc.params.layerHeight)))
  }
  function reset() { if (active.value) { active.value.params = defaults(); active.value.dirty = true; log(active.value, '已恢复默认参数。') } }
  return { documents, activeId, active, activeLayer, activeIr, selectLayer, add, activate, close, openDemo, setMode, update, reset, log }
})
