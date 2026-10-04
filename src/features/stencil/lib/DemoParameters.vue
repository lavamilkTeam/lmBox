<script setup lang="ts">
import { computed } from 'vue'
import { NInputNumber, NSelect, NSlider, NSwitch } from 'naive-ui'
import { RotateCcw, SlidersHorizontal, Layers, Box } from '@lucide/vue'
import { HelpTip } from '../../../ui/help-tip'
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
        <template v-if="!doc.demo">
          <label class="field-label">预览图层</label>
          <NSelect class="layer-picker" aria-label="预览图层" :value="doc.selectedLayer" :options="doc.files.map(file=>({label:file.name,value:file.name}))" size="small" @update:value="store.selectLayer"/>
          <p v-if="store.activeLayer?.diagnostic" class="field-help layer-diagnostic">{{ store.activeLayer.diagnostic.line ? `第 ${store.activeLayer.diagnostic.line} 行：` : '' }}{{ store.activeLayer.diagnostic.message }}</p>
        </template>
        <label v-if="doc.demo" class="field-label">锡膏面</label>
        <NSelect v-if="doc.demo" :value="doc.params.side" :options="sides" size="small" @update:value="store.update('side', $event)"/>
        <div class="source-file">{{ doc.demo ? doc.files.find(f => f.role === `${doc!.params.side}-paste`)?.name : store.activeLayer?.name }}</div>
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
        <h3><Box :size="14"/>模板尺寸<HelpTip v-if="!doc.demo" label="模板尺寸说明">矩形模板：按当前图层的图形范围加外扩边距生成。</HelpTip><span>02</span></h3>
        <label class="field-label">模板厚度 <span>mm</span></label>
        <NInputNumber :input-props="{ 'aria-label': '模板厚度' }" :value="doc.params.thickness" :min="0.05" :max="3" :step="0.05" size="small" @update:value="v => v !== null && store.update('thickness', v)"/>
        <label class="field-label">外扩边距 <span>mm</span></label>
        <NInputNumber :input-props="{ 'aria-label': '外扩边距' }" :value="doc.params.margin" :min="1" :max="30" :step="1" size="small" @update:value="v => v !== null && store.update('margin', v)"/>
        <label class="field-label"><span>开孔补偿 <HelpTip label="开孔补偿说明">正值扩大开孔，负值缩小开孔。</HelpTip></span><span>mm / 单边</span></label>
        <NInputNumber :input-props="{ 'aria-label': '开孔补偿' }" :value="doc.params.compensation" :min="-0.3" :max="0.5" :step="0.01" size="small" @update:value="v => v !== null && store.update('compensation', v)"/>
      </section>
      <section class="parameter-section board-info">
        <h3>文件信息<span>03</span></h3>
        <dl v-if="doc.mode==='3d' && !doc.demo && doc.model.mesh"><dt>模板尺寸</dt><dd>{{ (doc.model.mesh.summary.bounds[1]![0]!-doc.model.mesh.summary.bounds[0]![0]!).toFixed(2) }} × {{ (doc.model.mesh.summary.bounds[1]![1]!-doc.model.mesh.summary.bounds[0]![1]!).toFixed(2) }} mm</dd><dt>开孔数量</dt><dd>{{ doc.model.mesh.summary.holeCount }}</dd><dt>预览容差</dt><dd>{{ doc.model.mesh.summary.tolerance }} mm</dd></dl><dl v-else><dt>板框尺寸</dt><dd>{{ doc.width ? `${doc.width} × ${doc.height} mm` : '—' }}</dd><dt>{{ doc.demo ? '开孔数量' : '图形对象' }}</dt><dd>{{ doc.demo ? doc.apertures.length : store.activeIr?.objects.length ?? '—' }}</dd><dt>文件数量</dt><dd>{{ doc.files.length }}</dd></dl>
      </section>
    </div>
  </template>
</template>
