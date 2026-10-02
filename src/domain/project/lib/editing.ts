import type { DesignSettings, Optimization, ObjectEdit } from '../../../contracts'
import type { BoardDocument, EditSnapshot } from './types'

export const defaultOptimization = ():Optimization => ({scale:100,rounding:0,grid:false,gridThreshold:2,gridCell:1,gridWeb:.4,stagger:false,gap:.55,staggerOffset:15,staggerShrink:10,taper:100,inverseTaper:false})
export const defaultDesign = ():DesignSettings => ({kind:'stencil',frame:'bounds',extraLeft:0,extraRight:0,extraTop:0,extraBottom:0,cornerStyle:'round',cornerTL:0,cornerTR:0,cornerBL:0,cornerBR:0,boardThickness:1.6,clearance:.2,floor:1,slotWidth:0,chamfer:0,optimization:defaultOptimization()})
export const defaultEdit = (id:string):ObjectEdit => ({id,dx:0,dy:0,scaleX:1,scaleY:1,rotation:0,compensation:0,deleted:false})
export function snapshot(doc:BoardDocument):EditSnapshot {
  const {thickness,margin,compensation,mirror}=doc.params
  return JSON.parse(JSON.stringify({params:{thickness,margin,compensation,mirror},design:doc.editing.design,layers:doc.editing.layers,outlineLayer:doc.editing.outlineLayer})) as EditSnapshot
}
export function checkpoint(doc:BoardDocument) {
  doc.editing.past.push(snapshot(doc));if(doc.editing.past.length>50)doc.editing.past.shift()
  doc.editing.future=[]
}
export function restore(doc:BoardDocument,value:EditSnapshot) {
  Object.assign(doc.params,value.params)
  doc.editing.design=value.design;doc.editing.layers=value.layers;doc.editing.outlineLayer=value.outlineLayer
}
