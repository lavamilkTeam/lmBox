import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Aperture, BoardDocument, LayerFile, LogEntry, Parameters, ViewMode } from './types'

const defaults = (): Parameters => ({ side: 'top', grid: true, outline: true, mirror: false, opacity: 90, thickness: 0.2, margin: 5, compensation: 0, layerHeight: 0.1, nozzle: 0.4, speed: 30, temperature: 200, bedTemperature: 55, showTravel: false, layer: 1 })
function exampleApertures(): Aperture[] {
  const pads: Aperture[] = []
  const add = (x: number, y: number, width = 1.5, height = 2.5, round = false) => pads.push({ x, y, width, height, round })
  for (let i = 0; i < 12; i++) { add(31+i*3.4, 26, 1.3, 4); add(31+i*3.4, 70, 1.3, 4); add(25, 32+i*3.1, 4, 1.3); add(70, 32+i*3.1, 4, 1.3) }
  for (const [x,y] of [[12,15],[80,15],[12,73],[80,73],[39,10],[43,82]]) {
    for (let i=0;i<4;i++) { add(x+i*2.7,y,1.4,2.2); add(x+i*2.7,y+6,1.4,2.2) }
  }
  for (const [x,y] of [[13,35],[13,49],[81,35],[81,49],[36,43],[51,43]]) { add(x,y,3,4);add(x,y+7,3,4) }
  for (let i=0;i<8;i++) { add(12+i*10,92,2.4,2.4,true); add(12+i*10,5,2.4,2.4,true) }
  return pads
}
export const useProjectStore = defineStore('project', () => {
  const documents = ref<BoardDocument[]>([])
  const activeId = ref('')
  const active = computed(() => documents.value.find(d => d.id === activeId.value))
  let sequence = 0
  function log(doc: BoardDocument, message: string, level: LogEntry['level'] = 'info') {
    doc.logs.push({ id: ++sequence, time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), level, message })
    if (doc.logs.length > 300) doc.logs.shift()
  }
  function add(name: string, files: LayerFile[], demo = false) {
    const params = defaults()
    if (!files.some(f => f.role === 'top-paste') && files.some(f => f.role === 'bottom-paste')) params.side = 'bottom'
    const doc: BoardDocument = { id: crypto.randomUUID(), name, demo, mode: '2d', dirty: false, files, params, logs: [], width: demo ? 100 : null, height: demo ? 100 : null, apertures: demo ? exampleApertures() : [] }
    log(doc, demo ? '已打开示例板。' : `已导入 ${name}，发现 ${files.length} 个文件。`, 'success')
    documents.value.push(doc); activeId.value = doc.id
    return doc.id
  }
  function openDemo() {
    const existing = documents.value.find(d => d.demo)
    if (existing) { activeId.value = existing.id; return }
    add('示例板 · 100 × 100', [{ name: 'Demo_TopPaste.GTP', role: 'top-paste', size: 0 }, { name: 'Demo_Outline.GKO', role: 'outline', size: 0 }], true)
  }
  function activate(id: string) { if (documents.value.some(d => d.id === id)) activeId.value = id }
  function close(id: string) {
    const i = documents.value.findIndex(d => d.id === id)
    if (i < 0) return
    documents.value.splice(i, 1)
    if (activeId.value === id) activeId.value = documents.value[Math.min(i, documents.value.length - 1)]?.id ?? ''
  }
  function setMode(mode: ViewMode) { if (active.value) active.value.mode = mode }
  function update<K extends keyof Parameters>(key: K, value: Parameters[K]) {
    const doc = active.value
    if (!doc || doc.params[key] === value) return
    doc.params[key] = value; doc.dirty = true
    if (key === 'thickness' || key === 'layerHeight') doc.params.layer = Math.min(doc.params.layer, Math.max(1, Math.ceil(doc.params.thickness / doc.params.layerHeight)))
  }
  function reset() { if (active.value) { active.value.params = defaults(); active.value.dirty = true; log(active.value, '已恢复默认参数。') } }
  return { documents, activeId, active, add, activate, close, openDemo, setMode, update, reset, log }
})
