<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import { AppTheme } from '../ui/theme'
import { EngineeringShell } from '../ui/engineering-shell'
const GuideWorkspace = defineAsyncComponent(() => import('../modules/guide').then(module => module.GuideWorkspace))
const StencilWorkspace = defineAsyncComponent(() => import('../modules/stencil').then(module => module.StencilWorkspace))
const PropulsionWorkspace = defineAsyncComponent(() => import('../modules/propulsion').then(module => module.PropulsionWorkspace))
const CfdWorkspace = defineAsyncComponent(() => import('../modules/cfd').then(module => module.CfdWorkspace))
const tools = [
  { id: 'guide', label: '引导界面', category: '开始' },
  { id: 'stencil', label: '钢网设计与制造', category: '电子电气' },
  { id: 'nozzle', label: '喷管初步设计', category: '流体与动力' },
  { id: 'injector', label: '喷注器水力设计', category: '流体与动力' },
  { id: 'cfd', label: '计算流体力学', category: '流体与动力' },
]
const active = ref('guide')
function selectTool(id: string) { if (tools.some(tool => tool.id === id)) active.value = id }
</script>
<template>
  <AppTheme><EngineeringShell :active="active" :tools="tools" @select="selectTool">
    <GuideWorkspace v-if="active === 'guide'" @open="selectTool" />
    <StencilWorkspace v-else-if="active === 'stencil'" />
    <CfdWorkspace v-else-if="active === 'cfd'" />
    <PropulsionWorkspace v-else :tool="active === 'nozzle' ? 'nozzle' : 'injector'" />
  </EngineeringShell></AppTheme>
</template>
