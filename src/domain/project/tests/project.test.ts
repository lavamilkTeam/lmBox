import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from '../index'
import type { GraphicsIr } from '../../../contracts'
const sample: GraphicsIr = {schemaVersion:'2',unit:'mm',apertures:[{code:10,shape:{type:'circle',diameter:2}}],objects:[{kind:'flash',polarity:'dark',aperture:10,at:{x:10,y:20},sourceOffset:0}],source:{originalUnit:'MM',zeroSuppression:'L'}}
describe('independent document state', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('keeps parameters and modes isolated when switching and closing tabs', () => {
    const s=useProjectStore(); s.openDemo(sample); const first=s.activeId
    s.update('thickness',0.4);s.setMode('3d')
    const second=s.add('board.zip',[{name:'bottom.gbp',role:'bottom-paste',size:20}])
    expect(s.active?.params.side).toBe('bottom');expect(s.active?.params.thickness).toBe(0.2)
    s.update('margin',9);s.activate(first)
    expect(s.active?.params.thickness).toBe(0.4);expect(s.active?.mode).toBe('3d');expect(s.active?.params.margin).toBe(5)
    s.close(first);expect(s.activeId).toBe(second);expect(s.active?.params.margin).toBe(9)
    s.close(second);expect(s.active).toBeUndefined()
  })
  it('does not present demo geometry as an imported file', () => {
    const s=useProjectStore();s.add('real.zip',[])
    expect(s.active?.demo).toBe(false);expect(s.active?.apertures).toEqual([]);expect(s.active?.width).toBeNull()
  })
  it('clamps the preview layer after thickness changes', () => {
    const s=useProjectStore();s.openDemo(sample);s.update('thickness',1);s.update('layer',9);s.update('thickness',0.2)
    expect(s.active?.params.layer).toBe(2)
  })
  it('derives the sample model apertures from the same IR as the layer preview', () => {
    const s=useProjectStore();s.openDemo(sample)
    expect(s.active?.ir).toEqual(sample)
    expect(s.active?.apertures).toEqual([{x:9,y:19,width:2,height:2,round:true}])
    const first=s.activeId;s.openDemo(sample)
    expect(s.documents).toHaveLength(1);expect(s.activeId).toBe(first)
  })
})
