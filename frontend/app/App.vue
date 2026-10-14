<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from 'vue'
import { installedModules } from '../platform/desktop'
import { useNotification } from '../ui/theme'
import { AppTheme } from '../ui/theme'
import { EngineeringShell, ToolLibrary } from '../ui/engineering-shell'
import { useWorkspaceTabs } from './features/workspace-tabs'
const GuideWorkspace = defineAsyncComponent(() => import('../modules/guide').then(module => module.GuideWorkspace))
const StencilWorkspace = defineAsyncComponent(() => import('./module-entries/stencil'))
const NozzleWorkspace = defineAsyncComponent(() => import('./module-entries/nozzle'))
const InjectorWorkspace = defineAsyncComponent(() => import('./module-entries/injector'))
const CfdWorkspace = defineAsyncComponent(() => import('./module-entries/cfd'))
const VideoWorkspace = defineAsyncComponent(() => import('./module-entries/video'))
const AgentWorkspace = defineAsyncComponent(() => import('./module-entries/agent'))
const tools = ref([
  { id: 'stencil', label: '钢网设计与制造', category: '电子电气', available: true },
  { id: 'equilibrium', label: '化学平衡分析', category: '热化学', available: false },
  { id: 'cfd', label: '流体力学', category: '流体与动力', available: true },
  { id: 'nozzle', label: '喷管初步设计', category: '流体与动力', available: true },
  { id: 'injector', label: '喷注器水力设计', category: '流体与动力', available: true },
  { id: 'video', label: '视频工作流', category: 'AI', available: true },
  { id: 'agent', label: 'AI 工作助手', category: 'AI', available: true },
])
const notification = useNotification()
const availabilityReady = ref(false)
const installedIds = ref<string[] | null>(null)
onMounted(async () => {
  try {
    const installed = await installedModules()
    if (installed !== null) {
      tools.value.splice(0, tools.value.length, ...tools.value.map(tool => ({ ...tool, available: tool.available && installed.includes(tool.id), status: tool.available && !installed.includes(tool.id) ? '未安装' : '' })))
      installedIds.value = installed
    }
  } catch (error) {
    tools.value = tools.value.map(tool => ({ ...tool, available: false }))
    notification.error(String(error))
  } finally { availabilityReady.value = true }
})
const { active, tabs, closeConfirmation, selectTab, openTool, closeTab, cancelClose, confirmClose } = useWorkspaceTabs({
  tools: tools.value,
  closeHandlers: {
    cfd: async () => {
      const { closeCfdSession } = await import('./module-entries/cfd')
      await closeCfdSession()
    },
  },
})
function openInstalledTool(id: string) {
  if (!availabilityReady.value) return
  if (tools.value.some(tool => tool.id === id && tool.available)) openTool(id)
  else notification.warning('该模块尚未安装，请在安装器中添加。')
}
</script>
<template>
  <AppTheme><EngineeringShell :active="active" :tabs="tabs" :close-confirmation="closeConfirmation" @select="selectTab" @close="closeTab" @confirm-close="confirmClose" @cancel-close="cancelClose">
    <GuideWorkspace v-if="active === 'guide' && availabilityReady" :installed-ids="installedIds" @open="openInstalledTool" />
    <ToolLibrary v-else-if="active === 'library'" :tools="tools" @open="openInstalledTool" />
    <StencilWorkspace v-else-if="active === 'stencil'" />
    <CfdWorkspace v-else-if="active === 'cfd'" />
    <VideoWorkspace v-else-if="active === 'video'" />
    <AgentWorkspace v-else-if="active === 'agent'" />
    <NozzleWorkspace v-else-if="active === 'nozzle'" />
    <InjectorWorkspace v-else-if="active === 'injector'" />
  </EngineeringShell></AppTheme>
</template>
