import { beforeEach, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { isReactive } from 'vue'
import { useProjectStore } from '../index'
import fixture from '../../../../contracts/fixtures/v1/preview.json'
import type { GraphicsIr, PreviewMesh } from '../../../contracts'

beforeEach(()=>setActivePinia(createPinia()))
const mesh:PreviewMesh={positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2],contours:[],summary:{bounds:[[0,0,0],[1,1,.2]],volume:1,holeCount:2,triangleCount:1,tolerance:.01,unit:'mm'}}
function open() {
  const store=useProjectStore()
  store.add('real.gbr',[{name:'real.gbr',role:'top-paste',size:1,ir:fixture.ir as GraphicsIr}])
  return store
}
it('rejects stale and cancelled results and preserves model cache for view settings',()=>{
  const store=open(),old=store.beginModel()!
  store.update('thickness',.5)
  store.completeModel(old,{...old,mesh})
  expect(store.active!.model.mesh).toBeUndefined()
  const cancelled=store.beginModel()!
  store.failModel(cancelled,'cancelled',true)
  store.completeModel(cancelled,{...cancelled,mesh})
  expect(store.active!.model.status).toBe('cancelled')
  const current=store.beginModel()!
  store.completeModel(current,{...current,mesh})
  expect(store.active!.model.status).toBe('ready')
  expect(isReactive(store.active!.model.mesh)).toBe(false)
  store.update('grid',false);store.update('opacity',50)
  expect(store.active!.model.mesh).toBe(mesh)
  store.update('mirror',true)
  expect(store.active!.model.mesh).toBeUndefined()
})
it('does not apply another job or a closed document result',()=>{
  const store=open(),request=store.beginModel()!
  store.completeModel(request,{...request,jobId:'another-job',mesh})
  expect(store.active!.model.status).toBe('building')
  store.close(request.projectId)
  store.completeModel(request,{...request,mesh})
  expect(store.documents).toHaveLength(0)
})
