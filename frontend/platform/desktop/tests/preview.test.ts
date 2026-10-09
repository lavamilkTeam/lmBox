import { afterEach, expect, it, vi } from 'vitest'
import { generatePreview } from '../index'
import fixture from '../../../../contracts/fixtures/v1/preview.json'
import type { PreviewRequest, PreviewResult } from '../../../contracts'
const request=fixture as PreviewRequest
function response():PreviewResult {
  return {...request,mesh:{positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2],contours:[],objects:[],summary:{bounds:[[0,0,0],[1,1,1]],volume:1,holeCount:0,triangleCount:1,tolerance:.01,unit:'mm'}}}
}
afterEach(()=>vi.unstubAllGlobals())
it('rejects stale identities, malformed editable contours, and missing exports',async()=>{
  const result=response()
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(result))))
  result.jobId='old-job'
  await expect(generatePreview(request,new AbortController().signal)).rejects.toThrow('不匹配')
  result.jobId=request.jobId
  result.mesh.objects=[{id:'0:0:0',deleted:false,rings:[[[0,0],[1,1]]]}]
  await expect(generatePreview(request,new AbortController().signal)).rejects.toThrow('可编辑图形')
  result.mesh.objects=[]
  await expect(generatePreview({...request,exportFormat:'stl'},new AbortController().signal)).rejects.toThrow('导出文件')
  result.artifact={format:'stl',content:'solid test\nendsolid test'}
  expect((await generatePreview({...request,exportFormat:'stl'},new AbortController().signal)).artifact?.format).toBe('stl')
})
