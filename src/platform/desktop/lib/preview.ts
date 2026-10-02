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
  return result
}
