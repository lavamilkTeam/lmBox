<script setup lang="ts">
import { computed } from 'vue'
import { NInputNumber, NSelect, NSlider, NSwitch } from 'naive-ui'
import { RotateCcw, SlidersHorizontal, Layers, Box } from '@lucide/vue'
import { useProjectStore } from '../../../domain/project'
const store = useProjectStore()
const doc = computed(() => store.active)
const modeTitle = computed(() => doc.value?.mode === '2d' ? '2D 图层参数' : '3D 模型参数')
const sides = computed(() => [{ label: '顶层锡膏 · Top Paste', value: 'top', disabled: !doc.value?.files.some(f => f.role === 'top-paste') }, { label: '底层锡膏 · Bottom Paste', value: 'bottom', disabled: !doc.value?.files.some(f => f.role === 'bottom-paste') }])
</script>
<template>
  <template v-if="doc">
    <div class="panel-heading"><span><SlidersHorizontal :size="15"/>{{ modeTitle }}</span><button class="icon-button" title="恢复默认参数" aria-label="恢复默认参数" @click="store.reset"><RotateCcw :size="14"/></button></div>
    <div class="parameter-content">
      <section class="parameter-section">
        <h3><Layers :size="14"/>源图层<span>01</span></h3>
        <label class="field-label">锡膏面</label>
        <NSelect :value="doc.params.side" :options="sides" size="small" @update:value="store.update('side', $event)"/>
        <div class="source-file">{{ doc.files.find(f => f.role === `${doc!.params.side}-paste`)?.name ?? '未识别到锡膏层' }}</div>
        <div class="switch-row"><span>水平镜像</span><NSwitch size="small" :value="doc.params.mirror" @update:value="store.update('mirror', $event)"/></div>
      </section>
      <section v-if="doc.mode === '2d'" class="parameter-section">
        <h3><SlidersHorizontal :size="14"/>显示设置<span>02</span></h3>
        <div class="switch-row"><span>显示板框</span><NSwitch size="small" :value="doc.params.outline" @update:value="store.update('outline', $event)"/></div>
        <div class="switch-row"><span>显示网格</span><NSwitch size="small" :value="doc.params.grid" @update:value="store.update('grid', $event)"/></div>
        <div class="field-label spread"><span>图层不透明度</span><b>{{ doc.params.opacity }}%</b></div>
        <NSlider :value="doc.params.opacity" :min="10" :max="100" @update:value="store.update('opacity', $event)"/>
        <div class="layer-legend"><span><i class="swatch paste"/>锡膏开孔</span><span><i class="swatch outline"/>PCB 板框</span></div>
      </section>
      <section v-else class="parameter-section">
        <h3><Box :size="14"/>模板尺寸<span>02</span></h3>
        <label class="field-label">模板厚度 <span>mm</span></label>
        <NInputNumber :input-props="{ 'aria-label': '模板厚度' }" :value="doc.params.thickness" :min="0.05" :max="3" :step="0.05" size="small" @update:value="v => v !== null && store.update('thickness', v)"/>
        <label class="field-label">外扩边距 <span>mm</span></label>
        <NInputNumber :input-props="{ 'aria-label': '外扩边距' }" :value="doc.params.margin" :min="1" :max="30" :step="1" size="small" @update:value="v => v !== null && store.update('margin', v)"/>
        <label class="field-label">开孔补偿 <span>mm / 单边</span></label>
        <NInputNumber :input-props="{ 'aria-label': '开孔补偿' }" :value="doc.params.compensation" :min="-0.3" :max="0.5" :step="0.01" size="small" @update:value="v => v !== null && store.update('compensation', v)"/>
        <p class="field-help">正值扩大开孔，负值缩小开孔。</p>
      </section>
      <section class="parameter-section board-info">
        <h3>文件信息<span>03</span></h3>
        <dl><dt>板框尺寸</dt><dd>{{ doc.width ? `${doc.width} × ${doc.height} mm` : '—' }}</dd><dt>开孔数量</dt><dd>{{ doc.demo ? doc.apertures.length : '—' }}</dd><dt>文件数量</dt><dd>{{ doc.files.length }}</dd></dl>
      </section>
    </div>
  </template>
</template>
