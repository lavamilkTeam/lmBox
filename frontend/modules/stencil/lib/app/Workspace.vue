<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Layers, Check, X, AlertCircle, Upload } from '@lucide/vue'
import { DocumentTabs } from '../features/project'
import { BoardImport, useBoardImport } from '../features/import-board'
import { useParameterExport } from '../features/export-parameters'
import { ExportButton } from '../../../../ui/export-button'
import { PreviewWorkspace } from '../features/preview'
import { ParameterPanel } from '../features/stencil'
import { SlicingPanel } from '../features/slicing'
import { LogPanel } from '../features/logs'
import { useProjectStore } from '../domain/project'
import { loadDemoGraphics } from '../../../../platform/desktop'
import { useModelExport } from './lib/useModelExport'
import { useModelPreview } from './lib/useModelPreview'
const store = useProjectStore()
const modelPreview=useModelPreview()
const modelExport=useModelExport(notify)
const importer = ref<InstanceType<typeof BoardImport>>()
const { busy, importFiles, cancelImport } = useBoardImport(notify)
const { exportParams } = useParameterExport(notify)
const toast = ref('')
const closeId = ref('')
const dropDepth = ref(0)
let toastTimeout: ReturnType<typeof setTimeout>
const closingDoc = computed(() => store.documents.find(d=>d.id===closeId.value))
function notify(message: string) { toast.value=message; clearTimeout(toastTimeout); toastTimeout=setTimeout(()=>toast.value='',5000) }
function requestClose(id: string) { const doc=store.documents.find(d=>d.id===id); if (doc?.dirty) closeId.value=id; else store.close(id) }
function drop(event: DragEvent) { dropDepth.value=0; if (event.dataTransfer?.files.length) void importFiles(Array.from(event.dataTransfer.files)) }
function keydown(event: KeyboardEvent) { if ((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='o') { event.preventDefault(); importer.value?.open() }; if ((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s') { event.preventDefault(); exportParams() }; if(event.key==='Escape') closeId.value='' }
function beforeUnload(event: BeforeUnloadEvent) { if(store.documents.some(d=>d.dirty)) { event.preventDefault(); event.returnValue='' } }
onMounted(()=>{ store.openDemo(loadDemoGraphics()); window.addEventListener('keydown',keydown); window.addEventListener('beforeunload',beforeUnload) })
onBeforeUnmount(()=>{ clearTimeout(toastTimeout); window.removeEventListener('keydown',keydown); window.removeEventListener('beforeunload',beforeUnload) })
</script>
<template>
  <div class="stencil-workspace">
    <main class="studio" @dragenter.prevent="dropDepth++" @dragleave.prevent="dropDepth=Math.max(0,dropDepth-1)" @dragover.prevent @drop.prevent="drop">
      <header class="app-header">
        <a class="brand" href="#" @click.prevent="store.openDemo(loadDemoGraphics())"><strong>lm</strong>Box</a>
        <span class="header-divider"/>
        <div class="header-actions">
          <BoardImport ref="importer" :busy="busy" @files="importFiles"/>
          <ExportButton label="导出参数" :disabled="!store.active" aria-keyshortcuts="Control+S Meta+S" @click="exportParams"/>
        </div>
        <button v-if="busy" class="cancel-import" @click="cancelImport">取消导入</button>
      </header>
      <DocumentTabs @import="importer?.open()" @close="requestClose"/>
      <div class="work-area"><PreviewWorkspace @cancel-model="modelPreview.cancel" @import="importer?.open()" @demo="store.openDemo(loadDemoGraphics())"/><aside class="inspector" aria-label="参数面板"><SlicingPanel v-if="store.active?.mode==='gcode'"/><ParameterPanel v-else-if="store.active" :exporting="modelExport.exporting.value" @export="modelExport.exportModel"/><div v-else class="inspector-empty"><Layers :size="24"/></div></aside></div>
      <LogPanel/>
      <div v-if="dropDepth>0" class="drop-overlay"><Upload :size="38"/><h2>松开以导入文件</h2><p>支持 Gerber ZIP、独立 Gerber 图层</p></div>
      <Transition name="toast"><div v-if="toast" class="toast-message" role="status"><Check :size="16"/>{{ toast }}<button aria-label="关闭提示" @click="toast=''"><X :size="14"/></button></div></Transition>
      <div v-if="closingDoc" class="modal-backdrop" @click.self="closeId=''" @keydown.esc="closeId=''">
        <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="close-title"><AlertCircle :size="25"/><h2 id="close-title">关闭文件？</h2><p>“{{ closingDoc.name }}”的参数尚未导出。关闭后，这些调整会丢失。</p><div><button class="outline-button" autofocus @click="closeId=''">继续编辑</button><button class="primary-button" @click="store.close(closeId);closeId=''">放弃调整并关闭</button></div></section>
      </div>
    </main>
  </div>
</template>
