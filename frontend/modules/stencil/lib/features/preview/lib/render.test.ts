// Narrow regression tests for private SVG geometry. Do not expose renderer
// internals through the feature entry point just to test this calculation.
import { describe, expect, it } from 'vitest'
import type { GraphicsIr, ApertureShape, GraphicObject } from '../../../../../../contracts'
import { renderIr } from './render'

function fixture(shape: ApertureShape, objects?: GraphicObject[]): GraphicsIr {
  return {
    schemaVersion: '2', unit: 'mm', source: { originalUnit: 'MM', zeroSuppression: 'L' },
    apertures: [{code:10,shape}],
    objects: objects ?? [{kind:'flash',aperture:10,at:{x:10,y:20},polarity:'dark',sourceOffset:0}],
  }
}

describe('SVG geometry and aperture isolation', () => {
  it('keeps holes transparent and includes their outer aperture in bounds', () => {
    const result=renderIr(fixture({type:'circle',diameter:8,holeDiameter:2}))
    expect(result.bounds).toEqual({minX:6,maxX:14,minY:16,maxY:24})
    expect(result.operations[0]!.paths[0]!.fillRule).toBe('evenodd')
  })
  it('preserves local macro exposure and rotates its offset about the origin', () => {
    const ir=fixture({type:'macro',name:'offset',primitives:[
      {exposure:'on',shape:{type:'centerLine',center:{x:4,y:0},width:2,height:1,rotationDeg:90}},
      {exposure:'off',shape:{type:'circle',center:{x:0,y:4},diameter:0.5}},
    ]})
    ir.objects[0]!.polarity='clear'
    const op=renderIr(ir).operations[0]!
    expect(op.polarity).toBe('clear')
    expect(op.paths.map(p=>p.fill)).toEqual(['white','black'])
    expect(op.paths[0]!.transform).toBe('rotate(90) translate(4 0)')
  })
  it('renders thermal gaps as four separated sectors', () => {
    const result=renderIr(fixture({type:'macro',name:'thermal',primitives:[{exposure:'on',shape:{type:'thermal',center:{x:0,y:0},outerDiameter:8,innerDiameter:6,gap:1,rotationDeg:45}}]}))
    expect(result.operations[0]!.paths).toHaveLength(4)
    expect(result.operations[0]!.paths[1]!.transform).toBe('rotate(45) translate(0 0) rotate(90)')
  })
  it('keeps repeat instances and source operation order, including negative offsets', () => {
    const ir=fixture({type:'circle',diameter:2})
    ir.objects.push({...ir.objects[0]!,polarity:'clear'})
    ir.stepAndRepeat={xCount:2,yCount:2,xStep:-5,yStep:10}
    const result=renderIr(ir)
    expect(result.operations.map(op=>op.polarity)).toEqual(['dark','clear','dark','clear','dark','clear','dark','clear'])
    expect(result.bounds).toEqual({minX:4,minY:19,maxX:11,maxY:31})
    expect(result.operations[6]!.transform).toBe('translate(-5 10) translate(10 20)')
  })
  it('draws full circles with two arcs and includes radius plus stroke width', () => {
    const ir=fixture({type:'circle',diameter:2},[{kind:'stroke',polarity:'dark',aperture:10,sourceOffset:0,start:{x:5,y:0},segments:[{type:'arc',to:{x:5,y:0},center:{x:0,y:0},direction:'counterclockwise',fullCircle:true}]}])
    const result=renderIr(ir)
    expect(result.bounds).toEqual({minX:-6,minY:-6,maxX:6,maxY:6})
    expect(result.operations[0]!.paths[0]!.d.match(/A /g)).toHaveLength(2)
    expect(result.operations[0]!.paths[0]!.strokeLinecap).toBe('round')
  })
  it('refuses unsupported sweeps, undefined apertures and excessive repeats', () => {
    const ir=fixture({type:'rectangle',width:2,height:4},[{kind:'stroke',polarity:'dark',aperture:10,sourceOffset:0,start:{x:0,y:0},segments:[{type:'line',to:{x:5,y:0}}]}])
    expect(()=>renderIr(ir)).toThrow('描画暂不支持')
    ir.apertures=[]
    expect(()=>renderIr(ir)).toThrow('未定义的孔径')
    ir.stepAndRepeat={xCount:100000,yCount:1,xStep:1,yStep:0}
    expect(()=>renderIr(ir)).toThrow('重复数量')
  })
  it('keeps empty documents finite and rejects unsupported versions', () => {
    const ir=fixture({type:'circle',diameter:1},[])
    expect(renderIr(ir).bounds).toEqual({minX:0,minY:0,maxX:100,maxY:100})
    ir.schemaVersion='1'
    expect(()=>renderIr(ir)).toThrow('版本')
  })
})
