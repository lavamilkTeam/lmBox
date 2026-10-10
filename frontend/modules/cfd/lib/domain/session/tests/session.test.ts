import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCfdSession } from '../index'
import type { CfdRequest, CfdResponse, CfdState } from '../../../../../../contracts'

const snapshot=(revision:number):CfdState=>({revision,runtime:{freecadVersion:'1.1.3'},capabilities:{},commands:[],document:{name:'document',label:'工程',objects:[]},selection:[],editor:null,dialogs:[],geometry:[],plots:[],logs:[],busy:false,pendingAction:null})
const request=(requestId:string,expectedRevision:number):CfdRequest=>({schemaVersion:1,projectId:'project',requestId,expectedRevision,operation:'poll',payload:{}})
const response=(input:CfdRequest,revision:number,fields:Partial<CfdResponse>={}):CfdResponse=>({schemaVersion:1,projectId:input.projectId,requestId:input.requestId,inputRevision:input.expectedRevision,revision,ok:true,state:snapshot(revision),...fields})

describe('CFD session public snapshots',()=>{
  beforeEach(()=>setActivePinia(createPinia()))
  it('uses the authoritative response revision and retains a session across mounting',()=>{
    const store=useCfdSession();store.initialize('project')
    const initial=request('initial',0);store.begin(initial)
    expect(store.accept(initial,response(initial,1,{state:snapshot(17)}))).toBe(true)
    expect(store.revision).toBe(1)
    store.initialize('other-project')
    expect(store.projectId).toBe('project')
    expect(store.state?.revision).toBe(17)
  })
  it('rejects superseded requests and never restores older native snapshots',()=>{
    const store=useCfdSession();store.initialize('project')
    const old=request('old',0),current=request('current',0)
    store.begin(old);store.begin(current)
    expect(store.accept(old,response(old,2))).toBe(false)
    expect(store.accept(current,response(current,1))).toBe(true)
    expect(store.accept(old,response(old,0))).toBe(false)
    expect(store.revision).toBe(1)
    expect(store.state?.revision).toBe(1)
    store.fail(old,'旧请求失败')
    expect(store.error).toBe('')
    expect(()=>store.begin(old)).toThrow('请求版本已失效')
  })
  it('rejects mismatched response identities before changing native facts',()=>{
    const store=useCfdSession();store.initialize('project')
    const current=request('current',0);store.begin(current)
    for(const change of [{projectId:'other'},{requestId:'other'},{inputRevision:9},{schemaVersion:2}]) {
      expect(()=>store.accept(current,{...response(current,1),...change} as CfdResponse)).toThrow('不匹配')
    }
    expect(store.revision).toBe(0)
    expect(store.state).toBeNull()
  })
  it('surfaces asynchronous native failures without inventing successful results',()=>{
    const store=useCfdSession();store.initialize('project')
    const current=request('poll',0);store.begin(current)
    const state={...snapshot(3),lastAction:{requestId:'solver',operation:'command',ok:false,error:'缺少求解器'}}
    expect(store.accept(current,response(current,1,{state}))).toBe(true)
    expect(store.error).toBe('缺少求解器')
    expect(store.pending).toBeNull()
  })
  it('keeps a rejected action visible across passive polls until a successful action',()=>{
    const store=useCfdSession();store.initialize('project')
    const rejected={...request('selection',0),operation:'selectObject' as const}
    store.begin(rejected)
    store.accept(rejected,response(rejected,0,{ok:false,error:{code:'invalid_payload',message:'选择失败'}}))
    const poll=request('poll',0);store.begin(poll);store.accept(poll,response(poll,0))
    expect(store.error).toBe('选择失败')
    const selection={...request('selection-retry',0),operation:'selectObject' as const}
    store.begin(selection);store.accept(selection,response(selection,1))
    expect(store.error).toBe('')
  })
  it('preserves a stopped worker snapshot until an explicit successful close permits reset',()=>{
    const store=useCfdSession();store.initialize('project')
    const initial=request('initial',0);store.begin(initial);store.accept(initial,response(initial,1))
    const stopped=request('stopped',1);store.begin(stopped)
    store.accept(stopped,response(stopped,1,{ok:false,error:{code:'worker_stopped',message:'原生进程已停止'}}))
    expect(store.errorCode).toBe('worker_stopped')
    expect(store.state).not.toBeNull()
    expect(store.revision).toBe(1)
    const close={...request('close',1),operation:'close' as const};store.begin(close)
    expect(store.accept(close,response(close,2))).toBe(true)
    store.resetAfterClose()
    expect(store.projectId).toBe('project')
    expect(store.revision).toBe(0)
    expect(store.state).toBeNull()
    expect(store.pending).toBeNull()
    expect(store.errorCode).toBe('')
    const initialize={...request('restart',0),operation:'initialize' as const};store.begin(initialize)
    expect(store.accept(initialize,response(initialize,1))).toBe(true)
  })
})
