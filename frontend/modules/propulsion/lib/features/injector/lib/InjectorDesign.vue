<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown } from '@lucide/vue'
import { Button, Input, Badge, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Collapsible, CollapsibleTrigger, CollapsibleContent, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../../../../ui/shadcn'
import type { InjectorResult, LiquidCircuitResult } from '../../../../../../contracts'
import { useDesignStore } from '../../../domain/design'
import { PassagePlot, QuantityField, formatQuantity as f } from '../../../ui'
defineProps<{ result: InjectorResult | null; notice: string }>()
defineEmits<{ calculate: [] }>()
const store = useDesignStore(), session = computed(() => store.injectorSession), draft = computed(() => session.value.draft)
const circuits = [{ key: 'oxidizer' as const, label: '氧化剂路' }, { key: 'fuel' as const, label: '燃料路' }]
function passage(key: 'oxidizer' | 'fuel', type: unknown) {
  if (type !== 'circular' && type !== 'annular') return
  draft.value[key].passage = type === 'circular' ? { type: 'circular' } : { type: 'annular', innerDiameterM: 0.002 }
  store.edit('injector')
}
function innerDiameter(key: 'oxidizer' | 'fuel') { const p = draft.value[key].passage; return p.type === 'annular' ? p.innerDiameterM : 0 }
const rows: { key: keyof LiquidCircuitResult; label: string; unit: string; scale: number }[] = [
  { key: 'massFlowKgS', label: '该路质量流量', unit: 'kg/s', scale: 1 },
  { key: 'massFlowPerElementKgS', label: '单元质量流量', unit: 'kg/s', scale: 1 },
  { key: 'totalFlowAreaM2', label: '总流通面积', unit: 'mm²', scale: 1e-6 },
  { key: 'areaPerElementM2', label: '单元流通面积', unit: 'mm²', scale: 1e-6 },
  { key: 'innerDiameterM', label: '内径', unit: 'mm', scale: .001 },
  { key: 'outerDiameterM', label: '外径', unit: 'mm', scale: .001 },
  { key: 'hydraulicDiameterM', label: '水力直径', unit: 'mm', scale: .001 },
  { key: 'meanVelocityMS', label: '截面平均速度', unit: 'm/s', scale: 1 },
  { key: 'reynoldsNumber', label: '雷诺数', unit: '—', scale: 1 },
]
</script>
<template>
  <div class="design-body">
    <form id="injector-form" class="design-inputs" @submit.prevent="$emit('calculate')" @input="store.edit('injector')">
      <div class="example-note"><Badge variant="secondary">{{ session.example ? '示例参数（水）' : '自定义参数' }}</Badge><Button variant="link" size="sm" type="button" @click="store.reset('injector')">载入示例</Button></div>
      <section class="input-section"><h2>流量分配</h2><QuantityField v-model="draft.totalMassFlowKgS" label="总质量流量" unit="kg/s" :min="0.000001" /><QuantityField v-model="draft.oxidizerFuelMassRatio" label="氧燃质量比" unit="O/F" :min="0.000001" /><p class="input-note">两路示例均使用水的物性，用于检查水力计算；输入密度与黏度应对应实际工况。</p></section>
      <section v-for="circuit in circuits" :key="circuit.key" class="input-section"><h2>{{ circuit.label }}</h2>
        <div class="field-pair"><QuantityField v-model="draft[circuit.key].densityKgM3" :label="`${circuit.label}密度`" unit="kg/m³" :min="0.000001" /><QuantityField v-model="draft[circuit.key].dynamicViscosityPaS" :label="`${circuit.label}动力黏度`" unit="mPa·s" :scale=".001" :min="0.000001" /></div>
        <div class="field-pair"><QuantityField v-model="draft[circuit.key].pressureDropPa" :label="`${circuit.label}压降`" unit="MPa" :scale="1e6" :min="0.000001" /><QuantityField v-model="draft[circuit.key].dischargeCoefficient" :label="`${circuit.label}流量系数`" unit="Cd" :min="0.000001" :max="1" /></div>
        <QuantityField v-model="draft[circuit.key].elementCount" :label="`${circuit.label}元件数量`" :min="1" :max="100000" :step="1" />
        <label class="choice-field"><span>流道截面</span><Select :model-value="draft[circuit.key].passage.type" @update:model-value="passage(circuit.key, $event)"><SelectTrigger :aria-label="`${circuit.label}流道截面`"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="circular">圆孔</SelectItem><SelectItem value="annular">环隙</SelectItem></SelectContent></Select></label>
        <QuantityField v-if="draft[circuit.key].passage.type === 'annular'" :model-value="innerDiameter(circuit.key)" :label="`${circuit.label}环隙内径`" unit="mm" :scale=".001" :min="0.000001" @update:model-value="value => { const p = draft[circuit.key].passage; if (p.type === 'annular') p.innerDiameterM = value }" />
      </section>
    </form>
    <main class="design-output" aria-label="喷注器计算结果">
      <p v-if="session.error" role="alert" class="design-notice design-error">{{ session.error }}</p><p v-if="notice" role="status" class="design-notice">{{ notice }}</p>
      <section class="visual-panel"><div class="visual-heading">单元流道截面<span>各图独立缩放 · 非装配图</span></div>
        <div v-if="result" class="passage-plots"><PassagePlot v-for="circuit in circuits" :key="circuit.key" :label="circuit.label" :inner="result[circuit.key].innerDiameterM" :outer="result[circuit.key].outerDiameterM" /></div>
        <div v-else class="visual-empty"><strong>{{ session.pending ? '正在计算流道尺寸' : session.result ? '输入已更新' : '建立两路液体工况' }}</strong><p>设置流量、物性及压降，计算各路单元的流通尺寸。</p></div>
      </section>
      <section v-if="result" class="result-panel" data-testid="injector-results"><h2>水力计算结果</h2><div class="table-scroll"><Table aria-label="喷注器水力结果"><TableHeader><TableRow><TableHead>参数</TableHead><TableHead>氧化剂路</TableHead><TableHead>燃料路</TableHead><TableHead>单位</TableHead></TableRow></TableHeader><TableBody><TableRow v-for="row in rows" :key="row.key"><TableCell>{{ row.label }}</TableCell><TableCell>{{ f(result.oxidizer[row.key], row.scale) }}</TableCell><TableCell>{{ f(result.fuel[row.key], row.scale) }}</TableCell><TableCell>{{ row.unit }}</TableCell></TableRow></TableBody></Table></div></section>
      <Collapsible class="result-panel assumptions"><CollapsibleTrigger as-child><Button variant="ghost" class="section-toggle">模型范围与假设<ChevronDown :size="14" /></Button></CollapsibleTrigger><CollapsibleContent><ul><li>稳态、不可压缩、单相且无气蚀的液体流动；使用给定密度、黏度及流量系数。</li><li>同一路的相同元件均匀分流，两路通道独立计算。</li><li>不校验同轴装配的壁厚和间隙，不计算旋流、雾化、混合及燃烧稳定性。</li></ul><template v-if="result"><small>{{ result.modelVersion }}</small><ul><li v-for="assumption in result.assumptions" :key="assumption">{{ assumption }}</li></ul></template></CollapsibleContent></Collapsible>
    </main>
  </div>
</template>
