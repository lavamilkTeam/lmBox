import { beforeEach, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { isReactive } from 'vue'
import { useProjectStore } from '../index'
import fixture from '../../../../../../../contracts/fixtures/v1/preview.json'
import xyFixture from '../../../../../../../contracts/fixtures/v1/xy-scaling.json'
import type { GraphicsIr, Optimization, PreviewMesh } from '../../../../../../contracts'

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

it('keeps instance edits per layer, with undo/redo and immutable requests',()=>{
  const store=open(),ir=fixture.ir as GraphicsIr
  store.active!.files.push({name:'bottom.gbr',role:'bottom-paste',size:1,ir})
  store.setSelection(['0:0:0','0:0:999','nonsense'])
  expect(store.active!.editing.selected).toEqual(['0:0:0'])
  store.editSelection({dx:1,deleted:true})
  const request=store.beginModel()!
  expect(request.edits![0]!.dx).toBe(1)
  store.editSelection({dx:2})
  expect(request.edits![0]!.dx).toBe(1)
  store.undo();expect(store.activeEdits[0]!.dx).toBe(1)
  store.undo(true);expect(store.activeEdits[0]!.dx).toBe(2)
  store.selectLayer('bottom.gbr');expect(store.activeEdits).toEqual([])
  expect(store.active!.editing.selected).toEqual([])
  store.selectLayer('real.gbr');expect(store.activeEdits[0]!.deleted).toBe(true)
  store.setSelection(['0:0:0']);store.editSelection({},true)
  expect(store.activeEdits).toEqual([])
  expect(store.activeIr).toEqual(ir)
})

it('invalidates geometry for design changes but not selection, and gates exports on ready results',()=>{
  const store=open()
  expect(store.exportRequest()).toBeUndefined()
  const request=store.beginModel()!
  store.completeModel(request,{...request,mesh})
  store.setSelection(['0:0:0'])
  expect(store.active!.model.status).toBe('ready')
  expect(store.exportRequest()!.inputRevision).toBe(request.inputRevision)
  store.updateDesign('cornerTL',1)
  expect(store.active!.model.status).toBe('idle')
  expect(store.exportRequest()).toBeUndefined()
  store.undo();expect(store.active!.editing.design.cornerTL).toBe(0)
})

it('keeps XY and thickness settings together across requests and history',()=>{
  const store=open()
  const optimization={...xyFixture.edits[0]!.optimization,taper:120,inverseTaper:true} as Optimization
  store.setSelection(['0:0:0'])
  store.applyOptimization(optimization,true)
  const request=store.beginModel()!
  expect(request.edits![0]!.optimization).toEqual(optimization)
  expect(request.settings.design!.optimization.xyMode).toBe('off')
  store.applyOptimization({...optimization,xyMode:'opposed'},true)
  expect(request.edits![0]!.optimization!.xyMode).toBe('upper')
  store.undo()
  expect(store.activeEdits[0]!.optimization).toEqual(optimization)
  store.undo(true)
  expect(store.activeEdits[0]!.optimization!.xyMode).toBe('opposed')
  store.applyOptimization({...optimization,xyMode:'whole'},false)
  expect(store.active!.editing.design.optimization.xyMode).toBe('whole')
  expect(store.activeEdits[0]!.optimization!.xyMode).toBe('opposed')
})
