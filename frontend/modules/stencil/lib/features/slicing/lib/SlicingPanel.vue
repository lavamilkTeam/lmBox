<script setup lang="ts">
import { computed } from 'vue'
import { NInputNumber, NSlider, NSwitch } from 'naive-ui'
import { SlidersHorizontal, Layers, Gauge, Play } from '@lucide/vue'
import { useProjectStore } from '../../../domain/project'
const store = useProjectStore()
const doc = computed(() => store.active)
const layers = computed(() => Math.max(1, Math.ceil((doc.value?.params.thickness ?? 0.2) / (doc.value?.params.layerHeight ?? 0.1))))
</script>
<template>
  <template v-if="doc">
    <div class="panel-heading"><span><SlidersHorizontal :size="15"/>G-code 参数</span><span class="tiny-badge">FDM</span></div>
    <div class="parameter-content">
      <section class="parameter-section">
        <h3><Layers :size="14"/>切片设置<span>01</span></h3>
        <label class="field-label">层高 <span>mm</span></label><NInputNumber :input-props="{ 'aria-label': '层高' }" :value="doc.params.layerHeight" :min="0.05" :max="0.3" :step="0.05" size="small" @update:value="v => v !== null && store.update('layerHeight', v)"/>
        <label class="field-label">喷嘴直径 <span>mm</span></label><NInputNumber :input-props="{ 'aria-label': '喷嘴直径' }" :value="doc.params.nozzle" :min="0.1" :max="1" :step="0.1" size="small" @update:value="v => v !== null && store.update('nozzle', v)"/>
      </section>
      <section class="parameter-section">
        <h3><Gauge :size="14"/>打印参数<span>02</span></h3>
        <label class="field-label">打印速度 <span>mm/s</span></label><NInputNumber :input-props="{ 'aria-label': '打印速度' }" :value="doc.params.speed" :min="5" :max="300" size="small" @update:value="v => v !== null && store.update('speed', v)"/>
        <div class="two-fields"><div><label class="field-label">喷嘴 <span>°C</span></label><NInputNumber :input-props="{ 'aria-label': '喷嘴温度' }" :value="doc.params.temperature" :min="0" :max="350" size="small" @update:value="v => v !== null && store.update('temperature', v)"/></div><div><label class="field-label">热床 <span>°C</span></label><NInputNumber :input-props="{ 'aria-label': '热床温度' }" :value="doc.params.bedTemperature" :min="0" :max="150" size="small" @update:value="v => v !== null && store.update('bedTemperature', v)"/></div></div>
      </section>
      <section class="parameter-section">
        <h3>路径预览<span>03</span></h3>
        <div class="field-label spread"><span>当前层</span><b>{{ doc.params.layer }} / {{ layers }}</b></div><NSlider :value="doc.params.layer" :min="1" :max="layers" :step="1" @update:value="store.update('layer', $event)"/>
        <div class="switch-row"><span>显示空走路径</span><NSwitch size="small" :value="doc.params.showTravel" @update:value="store.update('showTravel', $event)"/></div>
      </section>
    </div>
    <div class="panel-footer"><button class="primary-button" disabled><Play :size="14"/>生成 G-code</button></div>
  </template>
</template>
