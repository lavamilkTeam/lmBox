import { afterEach, describe, expect, it, vi } from 'vitest'
import { inspectFiles } from '../index'

class ImportWorker {
  static instances:ImportWorker[]=[]
  onmessage:((event:MessageEvent)=>void)|null=null
  onerror:(()=>void)|null=null
  terminate=vi.fn()
  postMessage=vi.fn()
  constructor() {ImportWorker.instances.push(this)}
}
afterEach(()=>{vi.unstubAllGlobals();ImportWorker.instances=[]})

describe('browser import lifecycle',()=>{
  it('cancels the actual worker and does not return a partial document',async()=>{
    vi.stubGlobal('Worker',ImportWorker)
    const controller=new AbortController()
    const result=inspectFiles([new File(['source'],'top.gtp')],controller.signal)
    const rejected=expect(result).rejects.toMatchObject({name:'AbortError'})
    await vi.waitFor(()=>expect(ImportWorker.instances[0]!.postMessage).toHaveBeenCalled())
    controller.abort()
    await rejected
    expect(ImportWorker.instances[0]!.terminate).toHaveBeenCalledOnce()
  })
  it('ignores an unrelated worker response and accepts only its request result',async()=>{
    vi.stubGlobal('Worker',ImportWorker)
    const result=inspectFiles([new File(['source'],'top.gtp')])
    await vi.waitFor(()=>expect(ImportWorker.instances[0]!.postMessage).toHaveBeenCalled())
    const worker=ImportWorker.instances[0]!
    const request=worker.postMessage.mock.calls[0]![0] as {id:string}
    worker.onmessage!(new MessageEvent('message',{data:{id:'old-job',error:'old failure'}}))
    worker.onmessage!(new MessageEvent('message',{data:{id:request.id,result:{protocolVersion:'1',layers:[{name:'top.gtp',role:'top-paste',size:6,diagnostic:{code:'empty_geometry',message:'empty'}}]}}}))
    expect((await result)[0]!.layers[0]!.name).toBe('top.gtp')
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
})
