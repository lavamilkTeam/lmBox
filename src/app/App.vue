<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui'
import { Layers, Download, ChevronDown, Check, X, AlertCircle, Upload } from '@lucide/vue'
import { DocumentTabs } from '../features/project'
import { ImportButton } from '../features/import-board'
import { PreviewWorkspace } from '../features/preview'
import { ParameterPanel } from '../features/stencil'
import { SlicingPanel } from '../features/slicing'
import { LogPanel } from '../features/logs'
import { useProjectStore } from '../domain/project'
import { inspectFiles, saveParameters, loadDemoGraphics } from '../platform/desktop'
const store = useProjectStore()
const importer = ref<InstanceType<typeof ImportButton>>()
const busy = ref(false)
let importController: AbortController | undefined
const toast = ref('')
const closeId = ref('')
const dropDepth = ref(0)
let toastTimeout: ReturnType<typeof setTimeout>
const closingDoc = computed(() => store.documents.find(d=>d.id===closeId.value))
const overrides = { common: { primaryColor: '#3875ed', primaryColorHover: '#5489f2', primaryColorPressed: '#2962cb', borderRadius: '4px', fontSize: '12px', heightSmall: '30px', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif' }, Input: { color: '#f9fafc', colorFocus: '#fff', border: '1px solid #dfe4ec' }, InputNumber: { peers: { Input: { color: '#f9fafc' } } } }
function notify(message: string) { toast.value=message; clearTimeout(toastTimeout); toastTimeout=setTimeout(()=>toast.value='',5000) }
async function importFiles(files: File[]) {
  if (busy.value) return
  busy.value=true
  importController=new AbortController()
  try { const results=await inspectFiles(files,importController.signal); for (const r of results) store.add(r.name,r.layers); notify(`已读取 ${results.length} 个文件组，${results.flatMap(r=>r.layers).filter(f=>f.ir).length} 个图层已解析`) }
  catch(e) { const message=e instanceof Error ? e.message : '文件读取失败'; notify(message); if (store.active) store.log(store.active,message,'warning') }
  finally { busy.value=false;importController=undefined }
}
function exportParams() { if (store.active) { saveParameters(store.active); store.log(store.active,'参数配置已导出为 JSON。','success'); store.active.dirty=false; notify('参数配置已导出') } }
function requestClose(id: string) { const doc=store.documents.find(d=>d.id===id); if (doc?.dirty) closeId.value=id; else store.close(id) }
function drop(event: DragEvent) { dropDepth.value=0; if (event.dataTransfer?.files.length) void importFiles(Array.from(event.dataTransfer.files)) }
function keydown(event: KeyboardEvent) { if ((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='o') { event.preventDefault(); importer.value?.open() }; if ((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s') { event.preventDefault(); exportParams() }; if(event.key==='Escape') closeId.value='' }
function beforeUnload(event: BeforeUnloadEvent) { if(store.documents.some(d=>d.dirty)) { event.preventDefault(); event.returnValue='' } }
onMounted(()=>{ store.openDemo(loadDemoGraphics()); window.addEventListener('keydown',keydown); window.addEventListener('beforeunload',beforeUnload) })
onBeforeUnmount(()=>{ importController?.abort(); clearTimeout(toastTimeout); window.removeEventListener('keydown',keydown); window.removeEventListener('beforeunload',beforeUnload) })
</script>
<template>
  <NConfigProvider :theme-overrides="overrides"><NDialogProvider><NMessageProvider>
    <main class="studio" @dragenter.prevent="dropDepth++" @dragleave.prevent="dropDepth=Math.max(0,dropDepth-1)" @dragover.prevent @drop.prevent="drop">
      <header class="app-header">
        <a class="brand" href="#" @click.prevent="store.openDemo(loadDemoGraphics())"><strong>lm</strong>Box</a>
        <span class="header-divider"/><ImportButton ref="importer" :busy="busy" @files="importFiles"/><button v-if="busy" class="cancel-import" @click="importController?.abort()">取消导入</button>
        <div class="header-right"><button class="export-button" :disabled="!store.active" title="导出当前参数配置（⌘ / Ctrl + S）" @click="exportParams"><Download :size="15"/>导出参数<ChevronDown :size="13"/></button></div>
      </header>
      <DocumentTabs @import="importer?.open()" @close="requestClose"/>
      <div class="work-area"><PreviewWorkspace @import="importer?.open()" @demo="store.openDemo(loadDemoGraphics())"/><aside class="inspector" aria-label="参数面板"><SlicingPanel v-if="store.active?.mode==='gcode'"/><ParameterPanel v-else-if="store.active"/><div v-else class="inspector-empty"><Layers :size="24"/></div></aside></div>
      <LogPanel/>
      <div v-if="dropDepth>0" class="drop-overlay"><Upload :size="38"/><h2>松开以导入文件</h2><p>支持 Gerber ZIP、独立 Gerber 图层</p></div>
      <Transition name="toast"><div v-if="toast" class="toast-message" role="status"><Check :size="16"/>{{ toast }}<button aria-label="关闭提示" @click="toast=''"><X :size="14"/></button></div></Transition>
      <div v-if="closingDoc" class="modal-backdrop" @click.self="closeId=''" @keydown.esc="closeId=''">
        <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="close-title"><AlertCircle :size="25"/><h2 id="close-title">关闭文件？</h2><p>“{{ closingDoc.name }}”的参数尚未导出。关闭后，这些调整会丢失。</p><div><button class="outline-button" autofocus @click="closeId=''">继续编辑</button><button class="primary-button" @click="store.close(closeId);closeId=''">放弃调整并关闭</button></div></section>
      </div>
    </main>
  </NMessageProvider></NDialogProvider></NConfigProvider>
</template>
