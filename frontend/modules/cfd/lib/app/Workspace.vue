<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CfdOperation, CfdRequest, CfdValue } from '../../../../contracts'
import { cfdRequest, readCfdFile, saveCfdFile, chooseCfdPath, getCfdSessionId, observeViewportSize } from '../../../../platform/desktop'
import { Button, Tabs, TabsList, TabsTrigger, TabsContent, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, Tooltip, TooltipProvider, TooltipTrigger, TooltipContent, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, ScrollArea, Separator } from '../../../../ui/shadcn'
import { FolderOpen, Save, Undo2, Redo2, Maximize, Layers, Boxes, Grid2X2, Wind, FlaskConical, SquareDashed, Waves, Box, Gauge, ChartNoAxesCombined, SlidersHorizontal, Play, ChevronDown } from '@lucide/vue'
import { useCfdSession } from '../domain/session'
import { TaskPanel } from '../features/tasks'
import { DocumentPanel } from '../features/document'
import { GeometryViewer, ResultPlot, QtNode, chinese } from '../ui'
const session=useCfdSession()
const state=computed(()=>session.state)
const panel=ref('model')
const view=ref('geometry')
const fileInput=ref<HTMLInputElement>()
const sending=ref(false)
const reconnecting=ref(false)
const fitVersion=ref(0)
const viewError=ref('')
const viewport=ref<HTMLElement>()
const viewportSize=ref({width:1,height:1})
const pixelRatio=Math.min(window.devicePixelRatio || 1,2)
let stopObserving: (()=>void)|undefined
let queue:Promise<void>=Promise.resolve()
let queued=0
let timer:ReturnType<typeof setTimeout>|undefined
let disposed=false
let prefix=''
let prefixTime=0
const nativeDialogs=new Set<string>()
const toolbarIds=['CfdOF_Analysis','CfdOF_MeshFromShape','CfdOF_MeshRegion','CfdOF_GroupDynamicMeshRefinement','CfdOF_PhysicsModel','CfdOF_FluidMaterial','CfdOF_FluidBoundary','CfdOF_InitialiseInternal','CfdOF_InitialisationZone','CfdOF_PorousZone','CfdOF_MeanVelocityForce','CfdOF_ReportingFunctions','CfdOF_ScalarTransportFunctions','CfdOF_SolverControl']
const dynamicIds=['CfdOF_DynamicMeshInterfaceRefinement','CfdOF_DynamicMeshShockRefinement']
const developmentIds=['CfdOF_ReloadWorkbench','CfdOF_RunTests','CfdOF_UpdateTestData','CfdOF_CleanTests']
const commandIcons=[Layers,Boxes,Grid2X2,Grid2X2,Wind,FlaskConical,SquareDashed,Waves,Box,Grid2X2,Gauge,ChartNoAxesCombined,SlidersHorizontal,Play]
const command=(id:string)=>state.value?.commands.find(command=>command.id===id)
const menuCommands=computed(()=>toolbarIds.filter(id=>id!=='CfdOF_GroupDynamicMeshRefinement').map(command).filter(c=>c!==undefined))
const dialog=computed(()=>state.value?.dialogs.at(-1))
function request(operation:CfdOperation,payload:Record<string,CfdValue>={},nativeChooser=false):Promise<boolean> {
  queued++
  const next=queue.then(async()=>{
    queued--;if(disposed)return false;sending.value=true
    const request:CfdRequest={schemaVersion:1,projectId:session.projectId,requestId:crypto.randomUUID(),expectedRevision:session.revision,operation,payload}
    try {
      session.begin(request)
      const response=nativeChooser?await chooseCfdPath(request):await cfdRequest(request)
      if(!response){session.dismiss(request);return false}
      const accepted=session.accept(request,response)&&response.ok
      if(accepted&&response.artifact) {
        try {await saveCfdFile(response.artifact.name,response.artifact.base64)}
        catch(error) {
          if(!disposed&&session.projectId===request.projectId) {session.error=error instanceof Error?error.message:String(error);session.errorCode='save_failed'}
          return false
        }
      }
      return accepted
    } catch(error) {session.fail(request,error instanceof Error?error.message:String(error));return false}
    finally {sending.value=false}
  })
  queue=next.then(()=>undefined,()=>undefined)
  return next
}
async function reconnect() {
  if(reconnecting.value)return
  reconnecting.value=true
  try {if(await request('close')){session.resetAfterClose();await request('initialize')}}
  finally {reconnecting.value=false}
}
function runCommand(commandId:string,childCommandId?:string) {void request('command',childCommandId?{commandId,childCommandId}:{commandId})}
function field(fieldId:string,value:CfdValue,phase:'input'|'commit') {void request('setField',{fieldId,value,phase})}
function click(fieldId:string) {void request('clickField',{fieldId})}
async function importFiles(event:Event) {
  const input=event.target as HTMLInputElement
  const files=Array.from(input.files??[]);input.value=''
  for(const file of files)try{const data=await readCfdFile(file);await request('importFile',data)}catch(error){session.error=error instanceof Error?error.message:String(error)}
}
function closeDialog() {
  const active=dialog.value
  const cancel=active?.buttons.find(button=>button.enabled!==false && (['reject','cancel','no'].includes(button.role.toLowerCase()) || ['Cancel','Close','No'].includes(button.label)))
  if(active&&cancel)void request('dialogResponse',{dialogId:active.id,buttonId:cancel.id})
}
function schedulePoll() {
  timer=setTimeout(async()=>{
    if(disposed)return
    if(state.value&&!sending.value&&!queued)await request('poll')
    schedulePoll()
  },1000)
}
function keydown(event:KeyboardEvent) {
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();if(state.value)void request('exportDocument');return}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='o'){event.preventDefault();fileInput.value?.click();return}
  if(event.target instanceof HTMLElement && (['INPUT','TEXTAREA'].includes(event.target.tagName)||event.target.isContentEditable))return
  const key=event.key.toUpperCase(),now=Date.now()
  const shortcut=now-prefixTime<1600?`${prefix},${key}`:''
  const id:Record<string,string>={'N,C':'CfdOF_Analysis','M,R':'CfdOF_MeshRegion','M,D':'CfdOF_DynamicMeshInterfaceRefinement','M,S':'CfdOF_DynamicMeshShockRefinement','C,W':'CfdOF_FluidBoundary','S,C':'CfdOF_SolverControl'}
  if(id[shortcut]&&command(id[shortcut]!)?.enabled){event.preventDefault();runCommand(id[shortcut]!);prefix=''}else{prefix=key;prefixTime=now}
}
watch(viewport,element=>{stopObserving?.();stopObserving=element?observeViewportSize(element,(width,height)=>{viewportSize.value={width,height}}):undefined})
watch(()=>[dialog.value?.id,Boolean(dialog.value?.fileDialog)] as const,()=>{const current=dialog.value;if(current?.fileDialog&&!nativeDialogs.has(current.id)){nativeDialogs.add(current.id);void request('dialogResponse',{dialogId:current.id},true)}})
watch(()=>state.value?.editor?.id,id=>{if(id)panel.value='tasks';else if(panel.value==='tasks')panel.value='model'})
onMounted(()=>{session.initialize(getCfdSessionId());void request(state.value?'inspect':'initialize');schedulePoll();window.addEventListener('keydown',keydown)})
onBeforeUnmount(()=>{disposed=true;stopObserving?.();clearTimeout(timer);window.removeEventListener('keydown',keydown)})
</script>
<template>
  <main class="cfd-workspace" aria-label="计算流体动力学工作台">
    <TooltipProvider>
      <header class="cfd-toolbar">
        <DropdownMenu><DropdownMenuTrigger as-child><Button variant="ghost" size="sm">流体分析<ChevronDown :size="13"/></Button></DropdownMenuTrigger><DropdownMenuContent>
          <DropdownMenuItem v-for="item in menuCommands.slice(0,3)" :key="item.id" :disabled="!item.enabled" @select="runCommand(item.id)">{{ chinese(item.label) }}</DropdownMenuItem>
          <DropdownMenuSub><DropdownMenuSubTrigger>动态网格细化</DropdownMenuSubTrigger><DropdownMenuSubContent><DropdownMenuItem v-for="id in dynamicIds" :key="id" :disabled="!command(id)?.enabled" @select="runCommand(id)">{{ chinese(command(id)?.label) }}</DropdownMenuItem></DropdownMenuSubContent></DropdownMenuSub>
          <DropdownMenuItem v-for="item in menuCommands.slice(3)" :key="item.id" :disabled="!item.enabled" @select="runCommand(item.id)">{{ chinese(item.label) }}</DropdownMenuItem><DropdownMenuSeparator/>
          <DropdownMenuItem :disabled="!command('CfdOF_OpenPreferences')?.enabled" @select="runCommand('CfdOF_OpenPreferences')">偏好设置</DropdownMenuItem>
          <DropdownMenuSub><DropdownMenuSubTrigger>开发</DropdownMenuSubTrigger><DropdownMenuSubContent><DropdownMenuItem v-for="id in developmentIds" :key="id" :disabled="!command(id)?.enabled" @select="runCommand(id)">{{ chinese(command(id)?.label) }}</DropdownMenuItem></DropdownMenuSubContent></DropdownMenuSub>
        </DropdownMenuContent></DropdownMenu>
        <Separator orientation="vertical"/>
        <Button variant="ghost" size="icon" aria-label="打开或导入几何" title="打开或导入几何" :disabled="!state" @click="fileInput?.click()"><FolderOpen :size="16"/></Button>
        <Button variant="ghost" size="icon" aria-label="保存工程" title="保存工程" :disabled="!state" @click="request('exportDocument')"><Save :size="16"/></Button>
        <Button variant="ghost" size="icon" aria-label="撤销" title="撤销" :disabled="!state || state.capabilities.canUndo===false" @click="request('undo')"><Undo2 :size="16"/></Button>
        <Button variant="ghost" size="icon" aria-label="重做" title="重做" :disabled="!state || state.capabilities.canRedo===false" @click="request('redo')"><Redo2 :size="16"/></Button>
        <Separator orientation="vertical"/>
        <template v-for="(id,index) in toolbarIds" :key="id">
          <DropdownMenu v-if="id==='CfdOF_GroupDynamicMeshRefinement'"><DropdownMenuTrigger as-child><Button variant="ghost" size="icon" :disabled="!command(id)?.enabled" :aria-label="chinese(command(id)?.label) || '动态网格细化'" :title="chinese(command(id)?.tooltip)"><component :is="commandIcons[index]" :size="17"/></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem v-for="child in dynamicIds" :key="child" :disabled="!command(child)?.enabled" @select="runCommand(id,child)">{{ chinese(command(child)?.label) }}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          <Tooltip v-else><TooltipTrigger as-child><Button variant="ghost" size="icon" :disabled="!command(id)?.enabled" :aria-label="chinese(command(id)?.label || id)" :data-command="id" @click="runCommand(id)"><component :is="commandIcons[index]" :size="17"/></Button></TooltipTrigger><TooltipContent>{{ chinese(command(id)?.tooltip || command(id)?.label) }}</TooltipContent></Tooltip>
        </template>
        <Button variant="ghost" size="icon" aria-label="适应视图" title="适应视图" :disabled="!state?.geometry.length" @click="fitVersion++"><Maximize :size="16"/></Button>
        <input ref="fileInput" class="sr-only" type="file" multiple accept=".FCStd,.step,.stp,.brep,.iges,.igs,.stl" aria-label="选择流体工程或几何文件" @change="importFiles"/>
      </header>
      <div v-if="session.error" class="cfd-error" role="alert"><span>{{ chinese(session.error) }}</span><Button v-if="session.errorCode==='worker_stopped'" variant="outline" size="sm" :disabled="reconnecting" @click="reconnect">重新连接</Button><Button v-else-if="!state" variant="outline" size="sm" :disabled="sending" @click="request('initialize')">重试</Button></div>
      <div class="cfd-body">
        <Tabs v-model="panel" class="cfd-sidebar"><TabsList aria-label="组合视图"><TabsTrigger value="model">模型</TabsTrigger><TabsTrigger value="tasks">任务</TabsTrigger></TabsList>
          <TabsContent value="model" class="cfd-sidebar-content"><DocumentPanel v-if="state" :document="state.document" :selection="state.selection" :geometry="state.geometry" @select="(objectId,append)=>request('selectObject',{objectId,append})" @edit="objectId=>request('editObject',{objectId})" @visibility="(objectId,visible)=>request('setVisibility',{objectId,visible})" @delete="objectId=>request('deleteObject',{objectId})" @property="(objectId,name,value)=>request('setProperty',{objectId,name,value})"/></TabsContent>
          <TabsContent value="tasks" class="cfd-sidebar-content"><TaskPanel v-if="state?.editor" :editor="state.editor" @field="field" @click="click" @accept="request('editorAccept')" @reject="request('editorReject')"/></TabsContent>
        </Tabs>
        <Tabs v-model="view" class="cfd-main-view"><TabsList v-if="state?.plots.length" aria-label="结果视图"><TabsTrigger value="geometry">三维视图</TabsTrigger><TabsTrigger v-for="plot in state.plots" :key="plot.id" :value="plot.id">{{ chinese(plot.title) }}</TabsTrigger></TabsList>
          <TabsContent value="geometry" class="cfd-geometry-content"><div ref="viewport" class="cfd-geometry-viewport"><GeometryViewer :viewport-size="viewportSize" :pixel-ratio="pixelRatio" :geometry="state?.geometry ?? []" :selection="state?.selection ?? []" :fit-version="fitVersion" @select="(objectId,subelements,append)=>request('selectGeometry',{objectId,subelements,append})" @error="viewError=$event"/></div><span v-if="viewError" role="alert" class="cfd-view-error">{{ viewError }}</span><span v-if="!state && sending" role="status" class="cfd-view-status">正在启动…</span></TabsContent>
          <TabsContent v-for="plot in state?.plots ?? []" :key="plot.id" :value="plot.id" class="cfd-plot-content"><ResultPlot :plot="plot"/></TabsContent>
        </Tabs>
      </div>
      <section class="cfd-report"><header>报告视图<span v-if="state?.busy" role="status">正在执行…</span></header><ScrollArea class="cfd-report-scroll"><div role="log" aria-live="polite"><p v-for="(entry,index) in state?.logs ?? []" :key="index" :data-level="entry.level">{{ chinese(entry.text) }}</p></div></ScrollArea></section>
      <Dialog :open="Boolean(dialog)" @update:open="!$event && closeDialog()"><DialogContent class="cfd-native-dialog" :show-close-button="false" @escape-key-down.prevent="closeDialog" @pointer-down-outside.prevent><DialogHeader><DialogTitle>{{ chinese(dialog?.title) }}</DialogTitle><DialogDescription v-if="dialog?.text" class="cfd-dialog-text">{{ chinese(dialog.text) }}</DialogDescription></DialogHeader><div class="cfd-workspace cfd-dialog-controls"><QtNode v-for="root in dialog?.roots" :key="root.id" :node="root" @field="field" @click="click"/></div><DialogFooter><Button v-for="button in dialog?.buttons" :key="button.id" :disabled="button.enabled===false" :variant="['reject','cancel','no'].includes(button.role.toLowerCase())?'outline':'default'" @click="request('dialogResponse',{dialogId:dialog!.id,buttonId:button.id})">{{ chinese(button.label) }}</Button></DialogFooter></DialogContent></Dialog>
    </TooltipProvider>
  </main>
</template>
