import { onBeforeUnmount, ref, watch } from 'vue'
import type { ExportFormat } from '../../../../../contracts'
import { useProjectStore } from '../../domain/project'
import { generatePreview, saveModelArtifact } from '../../../../../platform/desktop'

export function useModelExport(notify:(message:string)=>void) {
  const store=useProjectStore(),exporting=ref(false)
  let controller:AbortController|undefined
  const stop=watch([()=>store.activeId,()=>store.active?.model.revision],()=>controller?.abort())
  async function exportModel(format:ExportFormat) {
    if(exporting.value)return
    const request=store.exportRequest(),doc=store.active
    if(!request || !doc)return
    request.exportFormat=format
    const abort=new AbortController();controller=abort;exporting.value=true
    try {
      const result=await generatePreview(request,abort.signal)
      if(abort.signal.aborted || doc.model.revision!==request.inputRevision || !store.documents.some(d=>d.id===doc.id))return
      if(!result.artifact || result.artifact.format!==format)throw new Error('导出产物无效。')
      if (!await saveModelArtifact(result.artifact,`${doc.name}-${doc.editing.design.kind}`)) return
      store.log(doc,`已导出 ${format.toUpperCase()}，输入版本 ${request.inputRevision}。`,'success');notify(`${format.toUpperCase()} 已导出`)
    } catch(error) {
      if(abort.signal.aborted)notify('参数已改变，导出已取消。')
      else {const message=error instanceof Error?error.message:'导出失败。';store.log(doc,message,'warning');notify(message)}
    } finally {if(controller===abort){controller=undefined;exporting.value=false}}
  }
  onBeforeUnmount(()=>{stop();controller?.abort()})
  return {exportModel,exporting}
}
