// Turns a parsed `GraphicsIr` into SVG path items for the 2D preview. This is
// display-only rendering: coordinates stay in the source's millimetre space
// (y-up) and the component applies a y-flip transform. It does not perform
// polarity booleaning or offset — those belong to the Python engine.

import type {
  ApertureShape,
  Contour,
  GraphicsIr,
  MacroPrimitive,
  Point,
  Segment,
} from '../../../contracts'

export interface PathItem {
  d: string
  transform?: string
  fill?: string
  stroke?: string
  strokeWidth?: number
  fillRule?: 'evenodd' | 'nonzero'
  strokeLinecap?: 'round' | 'butt'
  strokeLinejoin?: 'round'
}

const DARK = 'white'
const CLEAR = 'black'

function fmt(n: number): string {
  if (!Number.isFinite(n)) throw new Error('图形包含无效坐标。')
  return String(n)
}

function pt(p: Point): string {
  return `${fmt(p.x)} ${fmt(p.y)}`
}

// ---- shape paths, centred on the origin ----

function circleSubpath(r: number): string {
  return `M ${fmt(-r)} 0 A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(r)} 0 A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-r)} 0 Z`
}

function rectSubpath(w: number, h: number): string {
  const hw = w / 2
  const hh = h / 2
  return `M ${fmt(-hw)} ${fmt(-hh)} H ${fmt(hw)} V ${fmt(hh)} H ${fmt(-hw)} Z`
}

function polygonSubpath(vertices: number, diameter: number, rotationDeg = 0): string {
  const r = diameter / 2
  const rot = (rotationDeg * Math.PI) / 180
  const pts: string[] = []
  for (let i = 0; i < vertices; i++) {
    const a = rot + (i * 2 * Math.PI) / vertices
    pts.push(`${fmt(Math.cos(a) * r)} ${fmt(Math.sin(a) * r)}`)
  }
  return `M ${pts.join(' L ')} Z`
}

function obroundSubpath(w: number, h: number): string {
  if (w >= h) {
    const r = h / 2
    const half = w / 2 - r
    return `M ${fmt(-half)} ${fmt(-r)} H ${fmt(half)} A ${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(half)} ${fmt(r)} H ${fmt(-half)} A ${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(-half)} ${fmt(-r)} Z`
  }
  const r = w / 2
  const half = h / 2 - r
  return `M ${fmt(-r)} ${fmt(-half)} V ${fmt(half)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(r)} ${fmt(half)} V ${fmt(-half)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-r)} ${fmt(-half)} Z`
}

function withHole(shapePath: string, holeDiameter: number): { d: string; fillRule: 'evenodd' } {
  const r = holeDiameter / 2
  return { d: `${shapePath} ${circleSubpath(r)}`, fillRule: 'evenodd' }
}

// ---- arcs and segments (y-up; SVG sweep follows the flipped y axis) ----

function arcTo(cur: Point, seg: Extract<Segment, { type: 'arc' }>): string {
  const r = Math.hypot(seg.center.x - cur.x, seg.center.y - cur.y)
  const sweep = seg.direction === 'clockwise' ? 0 : 1
  if (seg.fullCircle) {
    const mx = seg.center.x - (cur.x - seg.center.x)
    const my = seg.center.y - (cur.y - seg.center.y)
    return `A ${fmt(r)} ${fmt(r)} 0 1 ${sweep} ${fmt(mx)} ${fmt(my)} A ${fmt(r)} ${fmt(r)} 0 1 ${sweep} ${fmt(cur.x)} ${fmt(cur.y)}`
  }
  const a0 = Math.atan2(cur.y - seg.center.y, cur.x - seg.center.x)
  const a1 = Math.atan2(seg.to.y - seg.center.y, seg.to.x - seg.center.x)
  let sweepAngle = seg.direction === 'clockwise' ? a0 - a1 : a1 - a0
  sweepAngle = ((sweepAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  const large = sweepAngle > Math.PI ? 1 : 0
  return `A ${fmt(r)} ${fmt(r)} 0 ${large} ${sweep} ${pt(seg.to)}`
}

function segmentTo(cur: Point, seg: Segment): { cmd: string; next: Point } {
  if (seg.type === 'line') return { cmd: `L ${pt(seg.to)}`, next: seg.to }
  return { cmd: arcTo(cur, seg), next: seg.to }
}

function contourPath(contour: Contour): string {
  let d = `M ${pt(contour.start)}`
  let cur = contour.start
  for (const seg of contour.segments) {
    const { cmd, next } = segmentTo(cur, seg)
    d += ` ${cmd}`
    cur = next
  }
  return `${d} Z`
}

// Each operation gets its own aperture mask; clear macro primitives only
// erase within that aperture. The outer mask applies layer polarity in order.
function renderPrimitive(prim: MacroPrimitive): PathItem[] {
  const fill = prim.exposure === 'on' ? DARK : CLEAR
  const s = prim.shape
  const rotation = `rotate(${fmt(s.rotationDeg ?? 0)})`
  const centered = (p: Point) => `${rotation} translate(${pt(p)})`
  switch (s.type) {
    case 'circle': return [{ d: circleSubpath(s.diameter / 2), transform: centered(s.center), fill }]
    case 'centerLine': return [{ d: rectSubpath(s.width, s.height), transform: centered(s.center), fill }]
    case 'lowerLeftLine': return [{ d: rectSubpath(s.width, s.height), transform: centered({x:s.lowerLeft.x+s.width/2,y:s.lowerLeft.y+s.height/2}), fill }]
    case 'vectorLine': return [{ d: `M ${pt(s.start)} L ${pt(s.end)}`, transform: rotation, fill:'none', stroke:fill, strokeWidth:s.width, strokeLinecap:'butt' }]
    case 'outline': return [{ d: `M ${s.vertices.map(pt).join(' L ')} Z`, transform: rotation, fill }]
    case 'polygon': return [{ d: polygonSubpath(s.vertices,s.diameter), transform:centered(s.center), fill }]
    case 'thermal': {
      // Four disjoint ring sectors, excluding the two gap strips. SVG arcs
      // display the primitive exactly without manufacturing tessellation.
      const outer = s.outerDiameter / 2, inner = s.innerDiameter / 2, gap = s.gap / 2
      if (!(gap > 0 && inner > Math.SQRT2 * gap && outer > inner)) throw new Error('该热焊盘的间隙尺寸暂不支持预览。')
      const o = Math.sqrt(outer*outer-gap*gap), i = Math.sqrt(inner*inner-gap*gap)
      const d = `M ${fmt(o)} ${fmt(gap)} A ${fmt(outer)} ${fmt(outer)} 0 0 1 ${fmt(gap)} ${fmt(o)} L ${fmt(gap)} ${fmt(i)} A ${fmt(inner)} ${fmt(inner)} 0 0 0 ${fmt(i)} ${fmt(gap)} Z`
      return [0,90,180,270].map(angle=>({d,fill,transform:`${centered(s.center)} rotate(${angle})`}))
    }
  }
}

function renderAperture(shape: ApertureShape): PathItem[] {
  if (shape.type === 'macro') return shape.primitives.flatMap(renderPrimitive)
  const base = shape.type === 'circle' ? circleSubpath(shape.diameter/2)
    : shape.type === 'rectangle' ? rectSubpath(shape.width,shape.height)
    : shape.type === 'obround' ? obroundSubpath(shape.width,shape.height)
    : polygonSubpath(shape.vertices,shape.diameter,shape.rotationDeg)
  return [{ ...( 'holeDiameter' in shape && shape.holeDiameter ? withHole(base,shape.holeDiameter) : {d:base}), fill:DARK }]
}

export interface RenderOperation {
  paths: PathItem[]
  transform: string
  polarity: 'dark' | 'clear'
}
export interface RenderedIr {
  operations: RenderOperation[]
  bounds: { minX:number; minY:number; maxX:number; maxY:number }
}

/** Display-only SVG operations. Unsupported sweeps fail instead of guessing. */
export function renderIr(ir: GraphicsIr): RenderedIr {
  if (ir.schemaVersion !== '2' || ir.unit !== 'mm') throw new Error('不支持该图形版本或坐标单位。')
  const byCode = new Map(ir.apertures.map(a=>[a.code,a.shape]))
  const operations: RenderOperation[] = []
  const bounds = {minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity}
  function include(p:Point, radius=0) {
    if (![p.x,p.y,radius].every(Number.isFinite)) throw new Error('图形包含无效坐标。')
    bounds.minX=Math.min(bounds.minX,p.x-radius); bounds.maxX=Math.max(bounds.maxX,p.x+radius)
    bounds.minY=Math.min(bounds.minY,p.y-radius); bounds.maxY=Math.max(bounds.maxY,p.y+radius)
  }
  // Conservative extents include aperture size and complete arc circles,
  // including rotated macro primitives; they never clip actual geometry.
  function apertureRadius(shape:ApertureShape):number {
    if (shape.type==='circle' || shape.type==='polygon') return shape.diameter/2
    if (shape.type==='rectangle' || shape.type==='obround') return Math.hypot(shape.width,shape.height)/2
    return Math.max(0,...shape.primitives.map(({shape:s})=>{
      switch(s.type) {
        case 'circle': case 'polygon': return Math.hypot(s.center.x,s.center.y)+s.diameter/2
        case 'thermal': return Math.hypot(s.center.x,s.center.y)+s.outerDiameter/2
        case 'centerLine': return Math.hypot(s.center.x,s.center.y)+Math.hypot(s.width,s.height)/2
        case 'lowerLeftLine': return Math.hypot(s.lowerLeft.x+s.width/2,s.lowerLeft.y+s.height/2)+Math.hypot(s.width,s.height)/2
        case 'vectorLine': return Math.max(Math.hypot(s.start.x,s.start.y),Math.hypot(s.end.x,s.end.y))+s.width/2
        case 'outline': return Math.max(0,...s.vertices.map(p=>Math.hypot(p.x,p.y)))
      }
    }))
  }
  const repeat=ir.stepAndRepeat ?? {xCount:1,yCount:1,xStep:0,yStep:0}
  if (![repeat.xCount,repeat.yCount].every(n=>Number.isSafeInteger(n)&&n>0) || ![repeat.xStep,repeat.yStep].every(Number.isFinite) || repeat.xCount*repeat.yCount*Math.max(1,ir.objects.length)>20000) throw new Error('图形重复数量超出预览限制。')
  for(let y=0;y<repeat.yCount;y++) for(let x=0;x<repeat.xCount;x++) {
    const dx=x*repeat.xStep,dy=y*repeat.yStep
    const point=(p:Point,radius=0)=>include({x:p.x+dx,y:p.y+dy},radius)
    const contour=(start:Point,segments:Segment[],radius=0)=>{
      point(start,radius); let cur=start
      for(const seg of segments) {
        point(seg.to,radius)
        if(seg.type==='arc') point(seg.center,Math.hypot(cur.x-seg.center.x,cur.y-seg.center.y)+radius)
        cur=seg.to
      }
    }
    for(const obj of ir.objects) {
      let paths:PathItem[]
      let transform=`translate(${fmt(dx)} ${fmt(dy)})`
      if(obj.kind==='region') {
        paths=[{d:obj.contours.map(contourPath).join(' '),fill:DARK,fillRule:'evenodd'}]
        obj.contours.forEach(c=>contour(c.start,c.segments))
      } else {
        const shape=byCode.get(obj.aperture)
        if(!shape) throw new Error(`图形引用了未定义的孔径 D${obj.aperture}。`)
        if(obj.kind==='flash') {
          paths=renderAperture(shape); transform+=` translate(${pt(obj.at)})`; point(obj.at,apertureRadius(shape))
        } else {
          if(shape.type!=='circle' || shape.holeDiameter) throw new Error(`孔径 D${obj.aperture} 的描画暂不支持预览。`)
          let d=`M ${pt(obj.start)}`,cur=obj.start
          for(const seg of obj.segments) { const next=segmentTo(cur,seg); d+=` ${next.cmd}`;cur=next.next }
          paths=[{d,fill:'none',stroke:DARK,strokeWidth:shape.diameter,strokeLinecap:'round',strokeLinejoin:'round'}]
          contour(obj.start,obj.segments,shape.diameter/2)
        }
      }
      operations.push({paths,transform,polarity:obj.polarity})
    }
  }
  if(!operations.length) return {operations,bounds:{minX:0,minY:0,maxX:100,maxY:100}}
  return {operations,bounds}
}
