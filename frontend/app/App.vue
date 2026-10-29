<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { installedModules } from '../platform/desktop'
import { useNotification } from '../ui/theme'
import { AppTheme } from '../ui/theme'
import { EngineeringShell, ToolLibrary } from '../ui/engineering-shell'
import { AccountDialog } from '../ui/account-dialog'
import { Button } from '../ui/shadcn'
import { ExperienceModeDialog } from '../ui/experience-mode'
import { useExperienceMode } from '../features/experience-mode'
import { useWorkspaceTabs } from './features/workspace-tabs'
const GuideWorkspace = defineAsyncComponent(() => import('../modules/guide').then(module => module.GuideWorkspace))
const DigitalLogicWorkspace = defineAsyncComponent(() => import('../modules/digital-logic').then(module => module.DigitalLogicWorkspace))
const StencilWorkspace = defineAsyncComponent(() => import('./module-entries/stencil'))
const NozzleWorkspace = defineAsyncComponent(() => import('./module-entries/nozzle'))
const CfdWorkspace = defineAsyncComponent(() => import('./module-entries/cfd'))
const VideoWorkspace = defineAsyncComponent(() => import('./module-entries/video'))
const AgentWorkspace = defineAsyncComponent(() => import('./module-entries/agent'))
const tools = ref([
  { id: 'stencil', label: '钢网设计与制造', category: '电子电气', available: true },
  { id: 'digital-logic', label: '数字逻辑仿真', category: '电子电气', available: true },
  { id: 'equilibrium', label: '化学平衡分析', category: '热化学', available: false },
  { id: 'cfd', label: '流体力学', category: '流体与动力', available: true },
  { id: 'nozzle', label: '喷管初步设计', category: '流体与动力', available: true },
  { id: 'video', label: 'ComfyUI', category: 'AI', available: true },
  { id: 'agent', label: 'Agent', category: 'AI', available: true },
])
const notification = useNotification()
const accountError = ref('')
// No account session adapter is connected yet; this host currently runs as a guest.
const accountStatus = ref<'unknown' | 'guest' | 'authenticated'>('guest')
const experience = useExperienceMode(accountStatus)
const { mode: experienceMode, open: experienceOpen } = experience
function accountProviderUnavailable(request: { provider: 'wechat' | 'qq' | 'github'; action: 'login' | 'bind' }) {
  const provider = { wechat: '微信', qq: 'QQ', github: 'GitHub' }[request.provider]
  accountError.value = `${provider} 授权服务尚未接入，暂时无法${request.action === 'login' ? '登录' : '绑定'}。`
}
const availabilityReady = ref(false)
const installedIds = ref<string[] | null>(null)
const agentAvailable = computed(() => availabilityReady.value && tools.value.some(tool => tool.id === 'agent' && tool.available))
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
let advancedTab = 'guide'
function selectExperience(mode: 'agent' | 'advanced') {
  if (mode === 'agent' && !agentAvailable.value) return
  if (mode === 'agent') {
    if (experienceMode.value !== 'agent') advancedTab = active.value
    openTool('agent')
  } else if (experienceMode.value === 'agent') {
    selectTab(tabs.value.some(tab => tab.id === advancedTab) ? advancedTab : 'guide')
  }
  experience.select(mode)
}
function selectVisibleTab(id: string) {
  selectTab(id)
  if (experienceMode.value === 'agent' && active.value !== 'agent') experience.select('advanced')
}
function closeVisibleTab(id: string) {
  closeTab(id)
  if (experienceMode.value === 'agent' && active.value !== 'agent') experience.select('advanced')
}
</script>
<template>
  <AppTheme>
  <EngineeringShell :active="active" :tabs="tabs" :flush-content="active === 'agent'" :close-confirmation="closeConfirmation" @select="selectVisibleTab" @close="closeVisibleTab" @confirm-close="confirmClose" @cancel-close="cancelClose">
    <template #account><Button variant="ghost" @click="experience.setOpen(true)">切换模式</Button><AccountDialog :error="accountError" @reset="accountError = ''" @submit="request => accountError = `统一账户服务尚未接入，暂时无法${request.mode === 'login' ? '登录' : '注册'}。`" @request-code="accountError = '邮箱验证码服务尚未接入，暂时无法发送。'" @provider-action="accountProviderUnavailable" /></template>
    <GuideWorkspace v-if="active === 'guide' && availabilityReady" :installed-ids="installedIds" @open="openInstalledTool" />
    <ToolLibrary v-else-if="active === 'library'" :tools="tools" @open="openInstalledTool" />
    <StencilWorkspace v-else-if="active === 'stencil'" />
    <DigitalLogicWorkspace v-else-if="active === 'digital-logic'" />
    <CfdWorkspace v-else-if="active === 'cfd'" />
    <VideoWorkspace v-else-if="active === 'video'" />
    <AgentWorkspace v-else-if="active === 'agent'" />
    <NozzleWorkspace v-else-if="active === 'nozzle'" />
    <template v-if="experienceMode !== 'agent' && agentAvailable && active !== 'agent'" #assistant><AgentWorkspace sidebar @expand="openInstalledTool('agent')" /></template>
  </EngineeringShell>
  <ExperienceModeDialog :open="experienceOpen" :agent-available="agentAvailable" @update:open="experience.setOpen" @select="selectExperience" />
  </AppTheme>
</template>
