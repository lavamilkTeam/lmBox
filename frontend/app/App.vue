<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import { AppTheme } from '../ui/theme'
import { EngineeringShell } from '../ui/engineering-shell'
import { readWorkspaceSelection, saveWorkspaceSelection } from '../platform/desktop'
const StencilWorkspace = defineAsyncComponent(() => import('../modules/stencil').then(module => module.StencilWorkspace))
const PropulsionWorkspace = defineAsyncComponent(() => import('../modules/propulsion').then(module => module.PropulsionWorkspace))
const CfdWorkspace = defineAsyncComponent(() => import('../modules/cfd').then(module => module.CfdWorkspace))
const tools = [
  { id: 'stencil', label: '钢网设计与制造', category: '电子电气' },
  { id: 'nozzle', label: '喷管初步设计', category: '流体与动力' },
  { id: 'injector', label: '喷注器水力设计', category: '流体与动力' },
  { id: 'cfd', label: '计算流体力学', category: '流体与动力' },
]
const storedTool = readWorkspaceSelection()
const active = ref(tools.some(tool => tool.id === storedTool) ? storedTool! : 'stencil')
function selectTool(id: string) { active.value = id; saveWorkspaceSelection(id) }
</script>
<template>
  <AppTheme><EngineeringShell :active="active" :tools="tools" @select="selectTool">
    <StencilWorkspace v-if="active === 'stencil'" />
    <CfdWorkspace v-else-if="active === 'cfd'" />
    <PropulsionWorkspace v-else :tool="active === 'nozzle' ? 'nozzle' : 'injector'" />
  </EngineeringShell></AppTheme>
</template>
