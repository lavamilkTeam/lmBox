<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { AppTheme } from '../ui/theme'
import { EngineeringShell, ToolLibrary } from '../ui/engineering-shell'
import { useWorkspaceTabs } from './features/workspace-tabs'
const GuideWorkspace = defineAsyncComponent(() => import('../modules/guide').then(module => module.GuideWorkspace))
const StencilWorkspace = defineAsyncComponent(() => import('../modules/stencil').then(module => module.StencilWorkspace))
const PropulsionWorkspace = defineAsyncComponent(() => import('../modules/propulsion').then(module => module.PropulsionWorkspace))
const CfdWorkspace = defineAsyncComponent(() => import('../modules/cfd').then(module => module.CfdWorkspace))
const VideoWorkspace = defineAsyncComponent(() => import('../modules/video').then(module => module.VideoWorkspace))
const AgentWorkspace = defineAsyncComponent(() => import('../modules/agent').then(module => module.AgentWorkspace))
const tools = [
  { id: 'stencil', label: '钢网设计与制造', category: '电子电气', available: true },
  { id: 'equilibrium', label: '化学平衡分析', category: '热化学', available: false },
  { id: 'cfd', label: '流体力学', category: '流体与动力', available: true },
  { id: 'nozzle', label: '喷管初步设计', category: '流体与动力', available: true },
  { id: 'injector', label: '喷注器水力设计', category: '流体与动力', available: true },
  { id: 'video', label: '视频工作流', category: 'AI', available: true },
  { id: 'agent', label: 'AI 工作助手', category: 'AI', available: true },
]
const { active, tabs, closeConfirmation, selectTab, openTool, closeTab, cancelClose, confirmClose } = useWorkspaceTabs({
  tools,
  closeHandlers: {
    cfd: async () => {
      const { closeCfdSession } = await import('../modules/cfd')
      await closeCfdSession()
    },
  },
})
</script>
<template>
  <AppTheme><EngineeringShell :active="active" :tabs="tabs" :close-confirmation="closeConfirmation" @select="selectTab" @close="closeTab" @confirm-close="confirmClose" @cancel-close="cancelClose">
    <GuideWorkspace v-if="active === 'guide'" @open="openTool" />
    <ToolLibrary v-else-if="active === 'library'" :tools="tools" @open="openTool" />
    <StencilWorkspace v-else-if="active === 'stencil'" />
    <CfdWorkspace v-else-if="active === 'cfd'" />
    <VideoWorkspace v-else-if="active === 'video'" />
    <AgentWorkspace v-else-if="active === 'agent'" />
    <PropulsionWorkspace v-else :tool="active === 'nozzle' ? 'nozzle' : 'injector'" />
  </EngineeringShell></AppTheme>
</template>
