<script setup lang="ts">
import { computed } from 'vue'
import { Button, NumberField, NumberFieldContent, NumberFieldInput, NumberFieldIncrement, NumberFieldDecrement, Slider, Switch } from '../../../../../../ui/shadcn'
import { SlidersHorizontal, Layers, Gauge, Play } from '@lucide/vue'
import { useProjectStore } from '../../../domain/project'
const store = useProjectStore()
const doc = computed(() => store.active)
type NumericParameter = 'layerHeight' | 'nozzle' | 'speed' | 'temperature' | 'bedTemperature'
function input(key: NumericParameter, event: Event, min: number, max: number) {
  const text = (event.target as HTMLInputElement).value.trim()
  if (!text || text.endsWith('.')) return
  const value = Number(text)
  if (Number.isFinite(value) && value >= min && value <= max) store.update(key, value)
}
const layers = computed(() => Math.max(1, Math.ceil((doc.value?.params.thickness ?? 0.2) / (doc.value?.params.layerHeight ?? 0.1))))
</script>
<template>
  <template v-if="doc">
    <div class="panel-heading"><span><SlidersHorizontal :size="15"/>G-code 参数</span><span class="tiny-badge">FDM</span></div>
    <div class="parameter-content">
      <section class="parameter-section">
        <h3><Layers :size="14"/>切片设置<span>01</span></h3>
        <label class="field-label">层高 <span>mm</span></label><NumberField class="parameter-number" :model-value="doc.params.layerHeight" :min="0.05" :max="0.3" :step="0.05" :step-snapping="false" :format-options="{useGrouping:false,maximumFractionDigits:20}" @update:model-value="v => typeof v === 'number' && Number.isFinite(v) && store.update('layerHeight', v)"><NumberFieldContent><NumberFieldDecrement aria-label="减少 层高"/><NumberFieldInput aria-label="层高" @input="input('layerHeight',$event,0.05,0.3)"/><NumberFieldIncrement aria-label="增加 层高"/></NumberFieldContent></NumberField>
        <label class="field-label">喷嘴直径 <span>mm</span></label><NumberField class="parameter-number" :model-value="doc.params.nozzle" :min="0.1" :max="1" :step="0.1" :step-snapping="false" :format-options="{useGrouping:false,maximumFractionDigits:20}" @update:model-value="v => typeof v === 'number' && Number.isFinite(v) && store.update('nozzle', v)"><NumberFieldContent><NumberFieldDecrement aria-label="减少 喷嘴直径"/><NumberFieldInput aria-label="喷嘴直径" @input="input('nozzle',$event,0.1,1)"/><NumberFieldIncrement aria-label="增加 喷嘴直径"/></NumberFieldContent></NumberField>
      </section>
      <section class="parameter-section">
        <h3><Gauge :size="14"/>打印参数<span>02</span></h3>
        <label class="field-label">打印速度 <span>mm/s</span></label><NumberField class="parameter-number" :model-value="doc.params.speed" :min="5" :max="300" :step-snapping="false" :format-options="{useGrouping:false,maximumFractionDigits:20}" @update:model-value="v => typeof v === 'number' && Number.isFinite(v) && store.update('speed', v)"><NumberFieldContent><NumberFieldDecrement aria-label="减少 打印速度"/><NumberFieldInput aria-label="打印速度" @input="input('speed',$event,5,300)"/><NumberFieldIncrement aria-label="增加 打印速度"/></NumberFieldContent></NumberField>
        <div class="two-fields"><div><label class="field-label">喷嘴 <span>°C</span></label><NumberField class="parameter-number" :model-value="doc.params.temperature" :min="0" :max="350" :step-snapping="false" :format-options="{useGrouping:false,maximumFractionDigits:20}" @update:model-value="v => typeof v === 'number' && Number.isFinite(v) && store.update('temperature', v)"><NumberFieldContent><NumberFieldDecrement aria-label="减少 喷嘴温度"/><NumberFieldInput aria-label="喷嘴温度" @input="input('temperature',$event,0,350)"/><NumberFieldIncrement aria-label="增加 喷嘴温度"/></NumberFieldContent></NumberField></div><div><label class="field-label">热床 <span>°C</span></label><NumberField class="parameter-number" :model-value="doc.params.bedTemperature" :min="0" :max="150" :step-snapping="false" :format-options="{useGrouping:false,maximumFractionDigits:20}" @update:model-value="v => typeof v === 'number' && Number.isFinite(v) && store.update('bedTemperature', v)"><NumberFieldContent><NumberFieldDecrement aria-label="减少 热床温度"/><NumberFieldInput aria-label="热床温度" @input="input('bedTemperature',$event,0,150)"/><NumberFieldIncrement aria-label="增加 热床温度"/></NumberFieldContent></NumberField></div></div>
      </section>
      <section class="parameter-section">
        <h3>路径预览<span>03</span></h3>
        <div class="field-label spread"><span>当前层</span><b>{{ doc.params.layer }} / {{ layers }}</b></div><Slider aria-label="当前层" :model-value="[doc.params.layer]" :min="1" :max="layers" :step="1" @update:model-value="store.update('layer', $event?.[0] ?? doc.params.layer)"/>
        <div class="switch-row"><span>显示空走路径</span><Switch aria-label="显示空走路径" :model-value="doc.params.showTravel" @update:model-value="store.update('showTravel', $event)"/></div>
      </section>
    </div>
    <div class="panel-footer"><Button size="sm" class="primary-button" disabled><Play :size="14"/>生成 G-code</Button></div>
  </template>
</template>
