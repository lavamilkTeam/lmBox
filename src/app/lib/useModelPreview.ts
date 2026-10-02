import { onBeforeUnmount, watch } from 'vue'
import { useProjectStore } from '../../domain/project'
import { generatePreview } from '../../platform/desktop'
import type { PreviewRequest } from '../../contracts'

// Application coordination keeps geometry and IO out of document state.
export function useModelPreview() {
  const store=useProjectStore()
  let controller:AbortController|undefined
  let request:PreviewRequest|undefined
  function cancel() {
    controller?.abort()
    if(request) store.failModel(request,'模型生成已取消。',true)
    controller=undefined;request=undefined
  }
  watch([()=>store.activeId,()=>store.active?.mode,()=>store.active?.model.revision],(_value,_old,onCleanup)=>{
    cancel()
    const doc=store.active
    if(!doc || doc.demo || doc.mode!=='3d' || doc.model.status==='ready')return
    const timer=setTimeout(async()=>{
      const input=store.beginModel()
      if(!input)return
      const abort=new AbortController();controller=abort;request=input
      try {const result=await generatePreview(input,abort.signal);store.completeModel(input,result)}
      catch(error) {if(!abort.signal.aborted)store.failModel(input,error instanceof Error?error.message:'模型生成失败。')}
      finally {if(request===input){controller=undefined;request=undefined}}
    },250)
    onCleanup(()=>{clearTimeout(timer);cancel()})
  },{immediate:true})
  onBeforeUnmount(cancel)
  return {cancel}
}
