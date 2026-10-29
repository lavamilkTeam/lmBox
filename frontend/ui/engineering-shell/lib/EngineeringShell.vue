<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Button, Tabs, TabsContent, TabsList, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '../../shadcn'
import WorkspaceTab from './WorkspaceTab.vue'
import './workspace-tabs.css'
const props = defineProps<{ active: string; tabs: { id: string; label: string; fixed?: boolean }[]; flushContent?: boolean; closeConfirmation?: { label: string; pending: boolean; error: string } }>()
const emit = defineEmits<{ select: [id: string]; close: [id: string]; confirmClose: []; cancelClose: [] }>()
const bar = ref<HTMLElement>()
const fixedTabs = computed(() => props.tabs.filter(tab => tab.fixed))
const openTabs = computed(() => props.tabs.filter(tab => !tab.fixed))
const beforeActiveId = computed(() => props.tabs[props.tabs.findIndex(tab => tab.id === props.active) - 1]?.id)
async function close(id: string) {
  emit('close', id)
  await nextTick()
  if (props.closeConfirmation) return
  bar.value?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')?.focus()
}
watch(() => props.closeConfirmation, async (current, previous) => {
  if (previous && !current) {
    await nextTick()
    bar.value?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')?.focus()
  }
})
function reveal(event: FocusEvent) {
  if (event.target instanceof HTMLElement) event.target.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' })
}
watch(() => props.active, () => {
  bar.value?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')?.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' })
}, { flush: 'post' })
</script>
<template>
  <Tabs class="engineering-shell" :class="{ 'is-leading-active': active === tabs[0]?.id }" :model-value="props.active" @update:model-value="emit('select', String($event))">
    <header ref="bar" class="engineering-bar">
      <TabsList class="engineering-tabs" aria-label="工作区页签" @focusin="reveal">
        <WorkspaceTab v-for="tab in fixedTabs" :key="tab.id" v-bind="tab" :active="active === tab.id" :before-active="beforeActiveId === tab.id" />
        <div v-if="openTabs.length" class="engineering-open-tabs" :style="{ '--open-tab-count': openTabs.length }">
          <WorkspaceTab v-for="tab in openTabs" :key="tab.id" v-bind="tab" :active="active === tab.id" :before-active="beforeActiveId === tab.id" @close="close" />
        </div>
      </TabsList>
      <div v-if="$slots.account" class="engineering-account"><slot name="account" /></div>
    </header>
    <div class="engineering-body" :class="{ 'has-assistant': !!$slots.assistant }">
      <div class="engineering-main">
        <TabsContent v-for="tab in tabs" :key="tab.id" :value="tab.id" class="engineering-content" :class="{ 'is-flush': flushContent }">
          <div class="engineering-content-inner"><slot v-if="active === tab.id" /></div>
        </TabsContent>
      </div>
      <aside v-if="$slots.assistant" class="engineering-assistant" aria-label="AI 侧栏"><slot name="assistant" /></aside>
    </div>
    <AlertDialog :open="!!closeConfirmation" @update:open="!$event && emit('cancelClose')">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>关闭{{ closeConfirmation?.label }}？</AlertDialogTitle>
          <AlertDialogDescription>未保存的工程会丢失，正在运行的计算将结束。</AlertDialogDescription>
        </AlertDialogHeader>
        <p v-if="closeConfirmation?.error" role="alert">{{ closeConfirmation.error }}</p>
        <AlertDialogFooter>
          <Button variant="outline" :disabled="closeConfirmation?.pending" @click="emit('cancelClose')">取消</Button>
          <Button :disabled="closeConfirmation?.pending" @click="emit('confirmClose')">{{ closeConfirmation?.pending ? '正在关闭…' : '关闭并释放' }}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </Tabs>
</template>
