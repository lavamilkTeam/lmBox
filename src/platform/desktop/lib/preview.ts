import type { PreviewRequest, PreviewResult } from '../../../contracts'

export async function generatePreview(request:PreviewRequest,signal:AbortSignal):Promise<PreviewResult> {
  const response=await fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal})
  let result:PreviewResult & {error?:string}
  try {result=await response.json()}
  catch {throw new Error('当前页面无法生成模型，请从本地应用打开。')}
  if(!response.ok || result.error) throw new Error(result.error ?? '模型生成失败。')
  if(result.protocolVersion!=='1' || result.projectId!==request.projectId || result.jobId!==request.jobId || result.inputRevision!==request.inputRevision) throw new Error('模型结果与当前输入不匹配。')
  const mesh=result.mesh
  if(!mesh || !Array.isArray(mesh.positions) || !Array.isArray(mesh.indices) || mesh.positions.length%3 || mesh.indices.length%3 || !mesh.positions.length || mesh.positions.length>3000000 || mesh.indices.length>1500000 || !mesh.positions.every(Number.isFinite) || !mesh.indices.every(i=>Number.isSafeInteger(i)&&i>=0&&i<mesh.positions.length/3) || mesh.summary?.unit!=='mm') throw new Error('模型网格数据无效。')
  const finiteTuple=(value:unknown,size:number):boolean=>Array.isArray(value)&&value.length===size&&value.every(Number.isFinite)
  const rings=(value:unknown):boolean=>Array.isArray(value)&&value.length<=20000&&value.every(r=>Array.isArray(r)&&r.length>=4&&r.length<=200000&&r.every(p=>finiteTuple(p,2)))
  if(!rings(mesh.contours) || !Array.isArray(mesh.summary.bounds) || mesh.summary.bounds.length!==2 || !mesh.summary.bounds.every(p=>finiteTuple(p,3)) || !Number.isFinite(mesh.summary.volume) || mesh.summary.volume<=0)throw new Error('模型轮廓或尺寸无效。')
  if(mesh.objects && (!Array.isArray(mesh.objects) || mesh.objects.length>20000 || new Set(mesh.objects.map(o=>o.id)).size!==mesh.objects.length || !mesh.objects.every(o=>typeof o.id==='string' && /^[0-9]+:[0-9]+:[0-9]+$/.test(o.id) && typeof o.deleted==='boolean' && rings(o.rings))))throw new Error('可编辑图形数据无效。')
  if(request.exportFormat && (!result.artifact || result.artifact.format!==request.exportFormat || typeof result.artifact.content!=='string' || !result.artifact.content.length || result.artifact.content.length>32*1024*1024))throw new Error('导出文件无效。')
  return result
}


export function saveModelArtifact(artifact:NonNullable<PreviewResult['artifact']>,name:string) {
  const mime={stl:'model/stl',svg:'image/svg+xml',dxf:'image/vnd.dxf'}[artifact.format]
  const url=URL.createObjectURL(new Blob([artifact.content],{type:mime}))
  const link=document.createElement('a');link.href=url;link.download=`${name.replace(/[\\/:*?"<>|]/g,'_')}.${artifact.format}`;link.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}
