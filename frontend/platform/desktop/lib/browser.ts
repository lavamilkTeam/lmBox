import type { GraphicsIr, ImportResult, ImportedLayer } from '../../../contracts'
import demoGraphics from './demo-ir.json'

export async function inspectFiles(files: File[], signal?: AbortSignal): Promise<{ name: string; layers: ImportedLayer[] }[]> {
  if (!files.length) return []
  if (files.length>500 || files.reduce((size,file)=>size+file.size,0)>150*1024*1024) throw new Error('所选文件超出数量或总大小限制。')
  const worker=new Worker(new URL('./import.worker.ts',import.meta.url),{type:'module'})
  const abort=()=>new DOMException('已取消导入。','AbortError')
  const results: {name:string;layers:ImportedLayer[]}[]=[]
  const singles:ImportedLayer[]=[]
  try {
    for(const file of files) {
      if(signal?.aborted) throw abort()
      if(file.size>30*1024*1024) throw new Error(`${file.name} 超过 30 MB。`)
      const bytes=await file.arrayBuffer()
      if(signal?.aborted) throw abort()
      const id=crypto.randomUUID()
      const result=await new Promise<ImportResult>((resolve,reject)=>{
        const cleanup=()=>{ clearTimeout(timeout);signal?.removeEventListener('abort',cancel);worker.onmessage=null;worker.onerror=null }
        const fail=(error:unknown)=>{cleanup();reject(error)}
        const cancel=()=>fail(abort())
        const timeout=setTimeout(()=>fail(new Error(`${file.name} 解析超时，请拆分较大的文件。`)),30000)
        signal?.addEventListener('abort',cancel,{once:true})
        worker.onerror=()=>fail(new Error('文件解析器加载失败，请刷新页面后重试。'))
        worker.onmessage=(event:MessageEvent<{id:string;result?:ImportResult;error?:string}>)=>{
          if(event.data.id!==id) return
          if(event.data.error) return fail(new Error(event.data.error))
          if(!event.data.result || event.data.result.protocolVersion!=='1') return fail(new Error('文件解析结果无效。'))
          cleanup();resolve(event.data.result)
        }
        worker.postMessage({id,name:file.name,bytes},[bytes])
      })
      if(/\.zip$/i.test(file.name)) results.push({name:file.name,layers:result.layers})
      else singles.push(...result.layers)
    }
    if(singles.length) {
      if(new Set(singles.map(file=>file.name)).size!==singles.length) throw new Error('所选图层含有重复文件名，请分别导入。')
      results.push({name:singles.length===1?singles[0]!.name:`${singles[0]!.name} 等 ${singles.length} 个图层`,layers:singles})
    }
    return results
  } finally {worker.terminate()}
}
// Loads the sample graphics IR produced by the Rust parser for demo.gbr. This
// exercises the renderer against the same contract as imported files.
export function loadDemoGraphics(): GraphicsIr {
  return demoGraphics as GraphicsIr
}
