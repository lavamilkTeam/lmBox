<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { X } from '@lucide/vue'
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '../../shadcn'
const props = defineProps<{ active: string; tabs: { id: string; label: string; fixed?: boolean }[] }>()
const emit = defineEmits<{ select: [id: string]; close: [id: string] }>()
const bar = ref<HTMLElement>()
async function close(id: string) {
  emit('close', id)
  await nextTick()
  bar.value?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')?.focus()
}
function reveal(event: FocusEvent) {
  if (event.target instanceof HTMLElement) event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
</script>
<template>
  <Tabs class="engineering-shell" :model-value="props.active" @update:model-value="emit('select', String($event))">
    <header ref="bar" class="engineering-bar">
      <TabsList class="engineering-tabs" aria-label="工作区页签" @focusin="reveal">
        <TabsTrigger v-for="tab in tabs.filter(tab => tab.fixed)" :key="tab.id" :value="tab.id" class="engineering-tab-trigger engineering-fixed-tab">{{ tab.label }}</TabsTrigger>
        <div class="engineering-open-tabs">
          <div v-for="tab in tabs.filter(tab => !tab.fixed)" :key="tab.id" class="engineering-tab" :class="{ 'is-active': active === tab.id }">
            <TabsTrigger :value="tab.id" class="engineering-tab-trigger" @keydown.delete.stop.prevent="close(tab.id)">{{ tab.label }}</TabsTrigger>
            <Button variant="ghost" size="icon" class="engineering-tab-close" :aria-label="`关闭${tab.label}页签`" @click="close(tab.id)"><X :size="13" /></Button>
          </div>
        </div>
      </TabsList>
    </header>
    <TabsContent v-for="tab in tabs" :key="tab.id" :value="tab.id" class="engineering-content">
      <slot v-if="active === tab.id" />
    </TabsContent>
  </Tabs>
</template>
<style scoped>
.engineering-shell{height:100dvh;display:flex;flex-direction:column;gap:0;overflow:hidden}.engineering-bar{height:42px;flex-shrink:0;min-width:0;border-bottom:1px solid var(--border);background:var(--muted);padding:5px 8px 0}.engineering-tabs{display:flex;justify-content:flex-start;gap:4px;width:100%;height:36px;padding:0;border-radius:0;background:transparent}.engineering-open-tabs{display:flex;gap:4px;min-width:0;height:100%;overflow-x:auto;scrollbar-width:none}.engineering-open-tabs::-webkit-scrollbar{display:none}.engineering-tab{display:flex;align-items:center;flex-shrink:0;max-width:240px;border:1px solid transparent;border-bottom:0;border-radius:8px 8px 0 0;padding-right:4px}.engineering-tab.is-active{background:var(--background);border-color:var(--border)}.engineering-tab-trigger{height:100%;flex:none;min-width:0;padding:0 12px;border-radius:8px 8px 0 0;font-size:12px;font-weight:400;box-shadow:none!important}.engineering-tab .engineering-tab-trigger{overflow:hidden;text-overflow:ellipsis;display:block;border:0;background:transparent}.engineering-fixed-tab{border-bottom:0}.engineering-fixed-tab[data-state=active]{border-color:var(--border)}.engineering-tab-close{width:22px;height:22px;border-radius:5px;flex-shrink:0;color:var(--muted-foreground)}.engineering-content{min-height:0;flex:1;overflow:auto}.engineering-content :deep(.stencil-workspace .studio){height:calc(100dvh - 42px)}@media(max-width:600px){.engineering-bar{padding-left:4px;padding-right:4px}.engineering-tab-trigger{padding:0 10px}.engineering-tab{max-width:210px}}
</style>
