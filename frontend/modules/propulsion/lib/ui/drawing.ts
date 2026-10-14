/** Presentation-only drawing: coordinates and dimensions are supplied by the solver. */
export interface DrawingPoint { x: number; radius: number }
export interface DrawingSpec {
  points: DrawingPoint[]
  inlet: number; convergenceStart: number; exit: number
  chamberRadius: number; throatRadius: number; exitRadius: number
  cylinderLength: number; convergenceLength: number; divergentLength: number; totalLength: number
  dimensions: [string, string][]
  notes: [string, string][]
  title: string; number: string; revision: number; example: boolean
  landmarks: { label: string; point: DrawingPoint }[]
}
const mm = (n: number) => (n * 1000).toFixed(3)
const xml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)
/** SVG is self-contained. All user-supplied strings are escaped before serialization. */
export function drawingSvg(s: DrawingSpec): string {
  const width = 1230, maxR = Math.max(s.chamberRadius, s.exitRadius)
  const scale = Math.min(width / (s.exit - s.inlet), 200 / maxR)
  const left = 180 + (width - (s.exit - s.inlet) * scale) / 2
  const x = (v: number) => left + (v - s.inlet) * scale, y = (v: number) => 440 - v * scale
  const items: string[] = []
  const line = (a: number, b: number, c: number, d: number, cls = 'thin') => items.push(`<line class="${cls}" x1="${a}" y1="${b}" x2="${c}" y2="${d}"/>`)
  const text = (a: number, b: number, value: string, anchor = 'start', cls = '') => items.push(`<text class="${cls}" x="${a}" y="${b}" text-anchor="${anchor}">${xml(value)}</text>`)
  const dim = (a: number, b: number, level: number, label: string) => {
    line(x(a), y(0), x(a), level + 8, 'extension'); line(x(b), y(0), x(b), level + 8, 'extension')
    line(x(a), level, x(b), level, 'dimension'); text((x(a) + x(b)) / 2, level - 9, label, 'middle', 'dim-label')
  }
  const diameter = (at: number, r: number, offset: number, label: string) => {
    const px = x(at) + offset
    line(x(at), y(r), px + 8, y(r), 'extension'); line(x(at), y(-r), px + 8, y(-r), 'extension')
    line(px, y(r), px, y(-r), 'dimension'); text(px + 10, 435, label, 'start', 'dim-label')
  }
  items.push('<rect class="sheet-frame" x="20" y="20" width="1640" height="1148" fill="white" stroke="#222"/>')
  text(48, 62, s.title || '燃烧室与喷管内流道', 'start', 'heading')
  text(48, 92, '轴对称纵向内轮廓｜尺寸单位 mm｜喉部平面 x = 0')
  line(20, 110, 1660, 110)
  dim(s.inlet, s.exit, 155, `总长 ${mm(s.totalLength)}`)
  dim(s.inlet, s.convergenceStart, 200, `筒段 ${mm(s.cylinderLength)}`)
  dim(s.convergenceStart, 0, 200, `收敛 ${mm(s.convergenceLength)}`)
  dim(0, s.exit, 200, `扩张 ${mm(s.divergentLength)}`)
  line(x(s.inlet) - 45, 440, x(s.exit) + 50, 440, 'axis')
  line(x(0), 245, x(0), 667, 'axis')
  for (const side of [1, -1]) items.push(`<polyline class="profile" points="${s.points.map(p => `${x(p.x)},${y(side * p.radius)}`).join(' ')}"/>`)
  diameter(s.inlet, s.chamberRadius, -70, `⌀${mm(2 * s.chamberRadius)}`)
  diameter(s.exit, s.exitRadius, 65, `⌀${mm(2 * s.exitRadius)}`)
  diameter(0, s.throatRadius, 0, `⌀${mm(2 * s.throatRadius)}`)
  text(x(0), 694, '喉部基准 x = 0', 'middle')
  text(x(s.inlet), 724, `入口 x = ${mm(s.inlet)}`, 'middle')
  text(x(s.convergenceStart), 752, `收敛起点 x = ${mm(s.convergenceStart)}`, 'middle')
  text(x(s.exit), 724, `出口 x = ${mm(s.exit)}`, 'middle')
  for (const { label, point } of s.landmarks) {
    items.push(`<circle cx="${x(point.x)}" cy="${y(point.radius)}" r="4" fill="white" stroke="#222"/>`)
    text(x(point.x), y(point.radius) - 12, label, 'middle')
  }
  const notes = s.notes.filter(([, value]) => value.trim())
  line(20, 777, 1660, 777)
  text(42, 805, '型面定义与控制尺寸', 'start', 'bold')
  if (notes.length) { line(840, 777, 840, 1102); text(862, 805, '结构与工艺条件', 'start', 'bold') }
  s.dimensions.slice(0, 6).forEach(([k, v], i) => text(42, 834 + i * 27, `${k}：${v}`))
  notes.slice(0, 7).forEach(([k, v], i) => text(862, 828 + i * 24, `${k}：${v}`))
  line(20, 1102, 1660, 1102)
  text(42, 1129, `${s.number.trim() ? `图号：${s.number}     ` : ''}输入版本：${s.revision}     比例：示意（横纵等比例，尺寸为准）`)
  text(42, 1153, '绘制：lmBox'); text(1630, 1142, 'A3 · 1 / 1', 'end', 'bold')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 1680 1188" role="img" aria-label="燃烧室与喷管二维设计图"><style>text{font:17px 'Noto Sans CJK SC','PingFang SC','Microsoft YaHei',sans-serif;fill:#222}.heading{font-size:26px;font-weight:600}.bold{font-weight:600}.thin,.extension,.dimension,.axis,.profile{fill:none;stroke:#222}.thin{stroke-width:1}.extension{stroke:#888;stroke-width:.7}.dimension{stroke-width:1;marker-start:url(#arrow);marker-end:url(#arrow)}.axis{stroke:#777;stroke-width:1;stroke-dasharray:16 5 3 5}.profile{stroke-width:2.6;stroke-linejoin:round}.dim-label{paint-order:stroke;stroke:white;stroke-width:6;stroke-linejoin:round}</style><defs><marker id="arrow" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 10 0 L 0 5 L 10 10 Z" fill="#222"/></marker></defs>${items.join('')}</svg>`
}
/** ASCII DXF, millimetres. No machining entities or tolerance is inferred. */
export function drawingDxf(s: DrawingSpec): string {
  const pairs: (string | number)[] = []
  const add = (...v: (string | number)[]) => pairs.push(...v)
  add(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1015', 9, '$INSUNITS', 70, 4, 9, '$MEASUREMENT', 70, 1, 0, 'ENDSEC')
  add(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LTYPE', 5, '100', 100, 'AcDbSymbolTable', 70, 1, 0, 'LTYPE', 5, '200', 330, '100', 100, 'AcDbSymbolTableRecord', 100, 'AcDbLinetypeTableRecord', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0, 0, 'ENDTAB')
  const layers = ['INNER_PROFILE', 'CENTERLINE', 'DATUM', 'DIMENSIONS', 'ANNOTATIONS']
  add(0, 'TABLE', 2, 'LAYER', 5, '101', 100, 'AcDbSymbolTable', 70, layers.length)
  layers.forEach((layer, index) => add(0, 'LAYER', 5, (0x201 + index).toString(16), 330, '101', 100, 'AcDbSymbolTableRecord', 100, 'AcDbLayerTableRecord', 2, layer, 70, 0, 62, 7, 6, 'CONTINUOUS'))
  add(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES')
  for (const side of [1, -1]) {
    add(0, 'POLYLINE', 100, 'AcDbEntity', 8, 'INNER_PROFILE', 100, 'AcDb2dPolyline', 66, 1, 70, 0, 10, 0, 20, 0, 30, 0)
    for (const p of s.points) add(0, 'VERTEX', 100, 'AcDbEntity', 8, 'INNER_PROFILE', 100, 'AcDbVertex', 100, 'AcDb2dVertex', 10, p.x * 1000, 20, side * p.radius * 1000, 30, 0)
    add(0, 'SEQEND', 100, 'AcDbEntity', 8, 'INNER_PROFILE')
  }
  const lo = s.inlet * 1000, hi = s.exit * 1000, radius = Math.max(s.chamberRadius, s.exitRadius) * 1000
  const height = Math.max((hi - lo) / 110, 1)
  const line = (a: number, b: number, c: number, d: number, layer: string) => add(0, 'LINE', 100, 'AcDbEntity', 8, layer, 100, 'AcDbLine', 10, a, 20, b, 30, 0, 11, c, 21, d, 31, 0)
  const text = (a: number, b: number, value: string) => add(0, 'TEXT', 100, 'AcDbEntity', 8, 'ANNOTATIONS', 100, 'AcDbText', 10, a, 20, b, 30, 0, 40, height, 1, value, 100, 'AcDbText')
  line(lo - 5 * height, 0, hi + 5 * height, 0, 'CENTERLINE')
  line(0, -radius - 2 * height, 0, radius + 2 * height, 'DATUM')
  const dim = (a: number, b: number, level: number, label: string) => {
    line(a, 0, a, level + height, 'DIMENSIONS'); line(b, 0, b, level + height, 'DIMENSIONS'); line(a, level, b, level, 'DIMENSIONS')
    for (const at of [a, b]) line(at - height, level - height, at + height, level + height, 'DIMENSIONS')
    text(a + height, level + height, label)
  }
  dim(lo, hi, radius + 10 * height, `TOTAL ${mm(s.totalLength)}`)
  dim(lo, s.convergenceStart * 1000, radius + 5 * height, `CYL ${mm(s.cylinderLength)}`)
  dim(s.convergenceStart * 1000, 0, radius + 5 * height, `CONV ${mm(s.convergenceLength)}`)
  dim(0, hi, radius + 5 * height, `DIV ${mm(s.divergentLength)}`)
  text(lo, -radius - 5 * height, `D_CHAMBER ${mm(s.chamberRadius * 2)} / D_THROAT ${mm(s.throatRadius * 2)} / D_EXIT ${mm(s.exitRadius * 2)}`)
  text(lo, -radius - 8 * height, `mm / 1:1 / input revision ${s.revision} / ${s.example ? 'EXAMPLE / ' : ''}PRELIMINARY - NOT FOR MANUFACTURE`)
  add(0, 'ENDSEC', 0, 'EOF')
  return pairs.join('\r\n') + '\r\n'
}
