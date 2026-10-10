<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown } from '@lucide/vue'
import { Button, Input, Badge, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Collapsible, CollapsibleTrigger, CollapsibleContent, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../../../../ui/shadcn'
import type { NozzleResult } from '../../../../../../contracts'
import { useDesignStore } from '../../../domain/design'
import { EngineeringDrawing, QuantityField, drawingSvg, drawingDxf, formatQuantity as f, type DrawingSpec } from '../../../ui'
const props = defineProps<{ result: NozzleResult | null; notice: string }>()
const emit = defineEmits<{ calculate: []; exportDrawing: [file: { name: string; content: string; mime: string }] }>()
const store = useDesignStore(), session = computed(() => store.nozzleSession), draft = computed(() => session.value.draft)
function contour(type: unknown) {
  if (type !== 'conical' && type !== 'quadraticBell') return
  draft.value.contour = type === 'conical' ? { type, halfAngleDeg: 15, throatArcRadiusRatio: 0.5 } : { type: 'quadraticBell', lengthOverThroatRadius: 12, startAngleDeg: 30, exitAngleDeg: 8, throatArcRadiusRatio: 0.5 }
  store.edit('nozzle')
}
function convergence(type: unknown) {
  if (!draft.value.chamber || !['filletedCone', 'tangentArcs', 'cubicBezier'].includes(String(type))) return
  draft.value.chamber.convergence = type === 'filletedCone' ? { type, halfAngleDeg: 30, inletRadiusM: .012, throatRadiusM: .018 }
    : type === 'tangentArcs' ? { type, joinAngleDeg: 45, throatRadiusFraction: .3 }
    : { type: 'cubicBezier', lengthM: .07, startHandleFraction: .35, endHandleFraction: .35 }
  store.edit('nozzle')
}
const noteLabels = { title: '图纸名称', drawingNumber: '图号', material: '材料', wallThickness: '各段壁厚', cooling: '冷却形式', connection: '连接方式与尺寸', tolerance: '尺寸公差', roughness: '表面粗糙度', standard: '采用标准' } as const
const drawing = computed<DrawingSpec | null>(() => {
  const r = props.result, c = r?.chamberGeometry
  const request = session.value.submitted
  if (!r || !c || request?.type !== 'nozzle' || !request.request.chamber) return null
  const q = request.request, conv = q.chamber!.convergence, notes = store.drawingNotes
  const point = (p: { xM: number; radiusM: number }) => ({ x: p.xM, radius: p.radiusM })
  const mm = (v: number) => (v * 1000).toFixed(3)
  const shape = conv.type === 'filletedCone' ? '入口圆弧 + 直锥 + 喉部圆弧，相切连接' : conv.type === 'tangentArcs' ? '双圆弧相切，首尾切线平行于轴线' : '三次 Bézier，首尾切线平行于轴线'
  const d = q.contour
  return {
    points: [...c.contour, ...r.contour.slice(1)].map(point), inlet: c.inletXM, convergenceStart: c.convergentStartXM, exit: r.divergentLengthM,
    chamberRadius: c.innerRadiusM, throatRadius: r.throatRadiusM, exitRadius: r.exitRadiusM,
    cylinderLength: c.cylinderLengthM, convergenceLength: c.convergentLengthM, divergentLength: r.divergentLengthM, totalLength: c.totalLengthM,
    title: notes.title, number: notes.drawingNumber, revision: r.identity.inputRevision, example: session.value.example,
    landmarks: conv.type === 'tangentArcs' ? [{ label: 'T', point: point(c.firstPoint) }] : [{ label: conv.type === 'cubicBezier' ? 'P1' : 'T1', point: point(c.firstPoint) }, { label: conv.type === 'cubicBezier' ? 'P2' : 'T2', point: point(c.secondPoint) }],
    dimensions: [
      ['收敛段', shape],
      ['收敛参数', conv.type === 'cubicBezier' ? `控制柄比例 ${conv.startHandleFraction} / ${conv.endHandleFraction}` : `R入口 ${mm(c.inletArcRadiusM)}；R喉前 ${mm(c.throatArcRadiusM)}；角 ${f(c.joinAngleDeg)}°`],
      [conv.type === 'cubicBezier' ? 'P1 / P2 (x, r)' : conv.type === 'tangentArcs' ? 'T 共切点 (x, r)' : 'T1 / T2 (x, r)', conv.type === 'tangentArcs' ? `(${mm(c.firstPoint.xM)}, ${mm(c.firstPoint.radiusM)})` : `(${mm(c.firstPoint.xM)}, ${mm(c.firstPoint.radiusM)}) / (${mm(c.secondPoint.xM)}, ${mm(c.secondPoint.radiusM)})`],
      ['扩张段', d.type === 'conical' ? `圆弧接直锥；半角 ${f(d.halfAngleDeg)}°` : `二次 Bézier；起始 ${f(d.startAngleDeg)}°，出口 ${f(d.exitAngleDeg)}°`],
      ['喉后圆弧 / 面积比', `R ${mm(d.throatArcRadiusRatio * r.throatRadiusM)}；Ac/At ${f(c.contractionRatio)}；Ae/At ${f(q.expansionRatio)}`],
      ['离散', `每段 ${q.segments}；全轮廓 ${c.contour.length + r.contour.length - 1} 点`],
    ],
    notes: [['材料', notes.material], ['壁厚', notes.wallThickness], ['冷却', notes.cooling], ['连接', notes.connection], ['公差', notes.tolerance], ['粗糙度', notes.roughness], ['标准', notes.standard]],
  }
})
function exportDrawing(kind: 'svg' | 'dxf') {
  if (!drawing.value) return
  emit('exportDrawing', { name: `chamber-nozzle.${kind}`, content: kind === 'svg' ? drawingSvg(drawing.value) : drawingDxf(drawing.value), mime: kind === 'svg' ? 'image/svg+xml' : 'application/dxf' })
}
const stations = { chamber: '燃烧室', throat: '喉部', exit: '出口' }
</script>
<template>
  <div class="design-body">
    <form id="nozzle-form" class="design-inputs" @submit.prevent="$emit('calculate')" @input="store.edit('nozzle')">
      <section class="input-section"><h2>工况</h2>
        <div class="field-pair"><QuantityField v-model="draft.chamberPressurePa" label="燃烧室压力" unit="MPa" :scale="1e6" :min="0.000001" /><QuantityField v-model="draft.ambientPressurePa" label="环境压力" unit="MPa" :scale="1e6" :min="0" /></div>
        <div class="field-pair"><QuantityField v-model="draft.massFlowKgS" label="总质量流量" unit="kg/s" :min="0.000001" /><QuantityField v-model="draft.expansionRatio" label="面积膨胀比" unit="Ae/At" :min="1.000001" /></div>
        <label class="choice-field"><span>化学模型</span><Select :model-value="draft.chemistry" @update:model-value="value => { if (value === 'equilibrium' || value === 'frozenAtChamber' || value === 'frozenAtThroat') { draft.chemistry = value; store.edit('nozzle') } }"><SelectTrigger aria-label="化学模型"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="equilibrium">平衡流</SelectItem><SelectItem value="frozenAtChamber">燃烧室冻结</SelectItem><SelectItem value="frozenAtThroat">喉部冻结</SelectItem></SelectContent></Select></label>
      </section>
      <section class="input-section"><h2>入口组元</h2>
        <div v-for="(reactant, index) in draft.reactants" :key="index" class="reactant-row"><div class="reactant-title"><span>组元 {{ index + 1 }}</span><Button variant="ghost" size="sm" type="button" :disabled="draft.reactants.length <= 1" :aria-label="`删除组元 ${index + 1}`" @click="draft.reactants.splice(index, 1); store.edit('nozzle')">移除</Button></div>
          <label class="choice-field"><span>物种名称</span><Input v-model="reactant.species" required maxlength="32" :aria-label="`组元 ${index + 1} 物种`" /></label>
          <div class="field-pair"><QuantityField v-model="reactant.massFraction" :label="`组元 ${index + 1} 质量分数`" :min="0.000000001" :max="1" /><QuantityField v-model="reactant.temperatureK" :label="`组元 ${index + 1} 温度`" unit="K" :min="0.000001" /></div>
        </div>
        <Button variant="outline" size="sm" type="button" :disabled="draft.reactants.length >= 32" @click="draft.reactants.push({ species: '', massFraction: 0, temperatureK: 298.15 }); store.edit('nozzle')">添加组元</Button>
        <p class="input-note">填写 CEA 数据库物种名称，质量分数之和须为 1。示例热化学工况取自 NASA RP-1311 Example 8。</p>
      </section>
      <section v-if="draft.chamber" class="input-section"><h2>燃烧室与收敛段</h2>
        <div class="field-pair"><QuantityField v-model="draft.chamber.innerDiameterM" label="燃烧室内径" unit="mm" :scale=".001" :min=".001" /><QuantityField v-model="draft.chamber.cylinderLengthM" label="筒段长度" unit="mm" :scale=".001" :min=".001" /></div>
        <label class="choice-field"><span>收敛段型式</span><Select :model-value="draft.chamber.convergence.type" @update:model-value="convergence"><SelectTrigger aria-label="收敛段型式"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="filletedCone">锥形＋圆弧过渡</SelectItem><SelectItem value="tangentArcs">双圆弧型</SelectItem><SelectItem value="cubicBezier">平滑曲线（三次 Bézier）</SelectItem></SelectContent></Select></label>
        <template v-if="draft.chamber.convergence.type === 'filletedCone'"><QuantityField v-model="draft.chamber.convergence.halfAngleDeg" label="收敛半角" unit="°" :min=".001" :max="89.999" /><div class="field-pair"><QuantityField v-model="draft.chamber.convergence.inletRadiusM" label="入口圆弧半径" unit="mm" :scale=".001" :min=".001" /><QuantityField v-model="draft.chamber.convergence.throatRadiusM" label="喉前圆弧半径" unit="mm" :scale=".001" :min=".001" /></div><p class="input-note">入口圆弧、直锥段、喉部上游圆弧依次相切；圆弧与筒段和喉部轴向切线相接，禁止过渡圆弧重叠。</p></template>
        <template v-else-if="draft.chamber.convergence.type === 'tangentArcs'"><QuantityField v-model="draft.chamber.convergence.joinAngleDeg" label="圆弧连接切线角" unit="°" :min=".001" :max="89.999" /><QuantityField v-model="draft.chamber.convergence.throatRadiusFraction" label="喉前圆弧占比" unit="R2/(R1+R2)" :min=".000001" :max=".999999" /><p class="input-note">两段圆弧在给定切线角处相切；首尾切线平行轴线，由径向落差与半径占比确定长度及两圆弧半径。</p></template>
        <template v-else><QuantityField v-model="draft.chamber.convergence.lengthM" label="曲线收敛长度" unit="mm" :scale=".001" :min=".001" /><div class="field-pair"><QuantityField v-model="draft.chamber.convergence.startHandleFraction" label="入口控制柄比例" :min=".000001" :max=".999999" /><QuantityField v-model="draft.chamber.convergence.endHandleFraction" label="喉部控制柄比例" :min=".000001" :max=".999999" /></div><p class="input-note">三次 Bézier：两端切线均平行轴线，控制柄长度按收敛长度给定。两比例之和不大于 1，保证轴向单调；不保证曲率连续。</p></template>
      </section>
      <section class="input-section"><h2>扩张段型面</h2>
        <label class="choice-field"><span>喷管型式</span><Select :model-value="draft.contour.type" @update:model-value="contour"><SelectTrigger aria-label="喷管型式"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="conical">锥形喷管</SelectItem><SelectItem value="quadraticBell">钟形喷管（二次曲线）</SelectItem></SelectContent></Select></label>
        <QuantityField v-if="draft.contour.type === 'conical'" v-model="draft.contour.halfAngleDeg" label="扩张半角" unit="°" :min="0.001" :max="89.999" />
        <template v-else><QuantityField v-model="draft.contour.lengthOverThroatRadius" label="扩张段长度比" unit="L/rt" :min="0.001" /><div class="field-pair"><QuantityField v-model="draft.contour.startAngleDeg" label="起始角" unit="°" :min="0.001" :max="89.999" /><QuantityField v-model="draft.contour.exitAngleDeg" label="出口角" unit="°" :min="0" :max="89.999" /></div></template>
        <QuantityField v-model="draft.contour.throatArcRadiusRatio" label="喉部圆弧半径比" unit="Rc/rt" :min="0.001" /><QuantityField v-model="draft.segments" label="每段离散数" :min="4" :max="2048" :step="1" />
      </section>
    </form>
    <main class="design-output nozzle-output" aria-label="喷管计算结果">
      <p v-if="session.error" role="alert" class="design-notice design-error">{{ session.error }}</p><p v-if="notice" role="status" class="design-notice">{{ notice }}</p>
      <section class="drawing-area"><div class="sheet-heading"><div>燃烧室与喷管 · 2D 设计图</div><div v-if="drawing" class="sheet-actions"><Button variant="outline" size="sm" @click="exportDrawing('svg')">导出 SVG 图纸</Button><Button variant="outline" size="sm" @click="exportDrawing('dxf')">导出 DXF 轮廓</Button></div></div><EngineeringDrawing v-if="drawing" :drawing="drawing" /><div v-else class="visual-empty"><strong>{{ session.pending ? '正在计算型面' : session.result ? '输入已更新' : '建立喷管计算工况' }}</strong><p>设置左侧参数，然后点击“开始计算”。</p></div></section>
      <Collapsible class="result-panel"><CollapsibleTrigger as-child><Button variant="ghost" class="section-toggle">图纸信息与结构条件<ChevronDown :size="14" /></Button></CollapsibleTrigger><CollapsibleContent><p class="input-note">填写需要出现在图纸上的结构与工艺条件，空项自动隐藏。</p><div class="drawing-notes"><label v-for="(label, key) in noteLabels" :key="key" class="choice-field"><span>{{ label }}</span><Input v-model="store.drawingNotes[key]" :aria-label="label" :maxlength="key === 'title' ? 30 : 35" placeholder="待定" /></label></div></CollapsibleContent></Collapsible>
      <section v-if="result" class="result-panel" data-testid="nozzle-results"><h2>计算结果</h2>
        <dl class="result-metrics"><div class="metric"><dt>理想推力</dt><dd>{{ f(result.idealThrustN) }}<small>N</small></dd></div><div class="metric"><dt>理想比冲</dt><dd>{{ f(result.idealSpecificImpulseS) }}<small>s</small></dd></div><div class="metric"><dt>推力系数</dt><dd>{{ f(result.idealThrustCoefficient) }}</dd></div></dl>
        <Table aria-label="喷管尺寸"><TableBody><TableRow><TableCell>喉部半径</TableCell><TableCell>{{ f(result.throatRadiusM, .001) }}</TableCell><TableCell>mm</TableCell></TableRow><TableRow><TableCell>出口半径</TableCell><TableCell>{{ f(result.exitRadiusM, .001) }}</TableCell><TableCell>mm</TableCell></TableRow><TableRow><TableCell>扩张段长度</TableCell><TableCell>{{ f(result.divergentLengthM, .001) }}</TableCell><TableCell>mm</TableCell></TableRow><template v-if="result.chamberGeometry"><TableRow><TableCell>筒段长度</TableCell><TableCell>{{ f(result.chamberGeometry.cylinderLengthM, .001) }}</TableCell><TableCell>mm</TableCell></TableRow><TableRow><TableCell>收敛段长度</TableCell><TableCell>{{ f(result.chamberGeometry.convergentLengthM, .001) }}</TableCell><TableCell>mm</TableCell></TableRow><TableRow><TableCell>内流道总长</TableCell><TableCell>{{ f(result.chamberGeometry.totalLengthM, .001) }}</TableCell><TableCell>mm</TableCell></TableRow></template><TableRow><TableCell>喉部面积</TableCell><TableCell>{{ f(result.throatAreaM2, .000001) }}</TableCell><TableCell>mm²</TableCell></TableRow><TableRow><TableCell>出口面积</TableCell><TableCell>{{ f(result.exitAreaM2, .000001) }}</TableCell><TableCell>mm²</TableCell></TableRow><TableRow v-if="result.conicalDivergenceFactor !== null"><TableCell>锥形发散修正因子（仅供参考）</TableCell><TableCell>{{ f(result.conicalDivergenceFactor) }}</TableCell><TableCell>—</TableCell></TableRow></TableBody></Table>
      </section>
      <section v-if="result" class="result-panel"><h2>热力状态</h2><div class="table-scroll"><Table aria-label="热力状态"><TableHeader><TableRow><TableHead>截面</TableHead><TableHead>温度 / K</TableHead><TableHead>压力 / MPa</TableHead><TableHead>马赫数</TableHead></TableRow></TableHeader><TableBody><TableRow v-for="station in result.cea.solution.stations" :key="station.kind"><TableCell>{{ stations[station.kind] }}</TableCell><TableCell>{{ f(station.state.temperatureK) }}</TableCell><TableCell>{{ f(station.state.pressurePa, 1e6) }}</TableCell><TableCell>{{ f(station.mach) }}</TableCell></TableRow></TableBody></Table></div></section>
      <p v-if="result?.warnings.length" class="design-notice" role="status">过膨胀：当前结果按理想附着流计算，未预测分离及侧向载荷。</p>
      <Collapsible class="result-panel assumptions"><CollapsibleTrigger as-child><Button variant="ghost" class="section-toggle">模型范围与假设<ChevronDown :size="14" /></Button></CollapsibleTrigger><CollapsibleContent><ul><li>稳态一维理想性能，喉部流量系数为 1；型面损失未计入理想推力。</li><li>统一生成筒段、收敛段和扩张段内轮廓；壁厚、冷却及连接结构尚未定义。有限燃烧室几何不改变 CEA 无限面积室理想性能假设。</li><li>钟形采用给定角度的二次曲线近似，不属于最优推力型面求解。</li></ul><template v-if="result"><small>{{ result.modelVersion }}</small><ul><li v-for="assumption in result.assumptions" :key="assumption">{{ assumption }}</li></ul></template></CollapsibleContent></Collapsible>
    </main>
  </div>
</template>
