<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { AppTheme } from '../ui/theme'
import { EngineeringShell, ToolLibrary } from '../ui/engineering-shell'
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
const active = ref('guide')
const opened = ref<string[]>([])
const closeConfirmation = ref<{ label: string; pending: boolean; error: string }>()
const fixedTabs = [{ id: 'guide', label: '开始', fixed: true }, { id: 'library', label: '功能库', fixed: true }]
const tabs = computed(() => [...fixedTabs, ...opened.value.map(id => ({ id, label: tools.find(tool => tool.id === id)!.label }))])
function selectTab(id: string) {
  if (tabs.value.some(tab => tab.id === id)) active.value = id
}
function openTool(id: string) {
  if (!tools.some(tool => tool.id === id && tool.available)) return
  if (!opened.value.includes(id)) opened.value.push(id)
  active.value = id
}
function closeTab(id: string) {
  if (id === 'cfd') { closeConfirmation.value = { label: '流体力学', pending: false, error: '' }; return }
  removeTab(id)
}
function cancelClose() { if (!closeConfirmation.value?.pending) closeConfirmation.value = undefined }
async function confirmClose() {
  const confirmation = closeConfirmation.value
  if (!confirmation || confirmation.pending) return
  confirmation.pending = true
  confirmation.error = ''
  try {
    const { closeCfdSession } = await import('../modules/cfd')
    await closeCfdSession()
    removeTab('cfd')
    closeConfirmation.value = undefined
  } catch (error) {
    confirmation.error = error instanceof Error ? error.message : String(error)
  } finally { confirmation.pending = false }
}
function removeTab(id: string) {
  const index = opened.value.indexOf(id)
  if (index < 0) return
  opened.value.splice(index, 1)
  if (active.value === id) active.value = opened.value[index] ?? opened.value[index - 1] ?? 'guide'
}
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
