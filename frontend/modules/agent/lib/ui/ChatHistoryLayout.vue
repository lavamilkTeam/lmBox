<script setup lang="ts">
import { ref } from 'vue'
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from '@lucide/vue'
import { Button, Input } from '../../../../ui/shadcn'

const props = defineProps<{
  compact: boolean; activeId: string; query: string; busy: boolean
  items: Array<{ id: string; title: string; status: string }>
}>()
const emit = defineEmits<{ select: [id: string]; newChat: []; query: [value: string] }>()
const expanded = ref(!props.compact)
</script>

<template>
  <div class="agent-history-layout">
    <Transition name="agent-history">
    <aside v-if="expanded" class="agent-history" aria-label="聊天记录">
      <div class="agent-history-heading"><strong>聊天记录</strong><Button variant="ghost" size="icon-sm" aria-label="收起聊天记录" @click="expanded = false"><PanelLeftCloseIcon :size="16" /></Button></div>
      <Button variant="outline" :disabled="busy" @click="emit('newChat')">新建聊天</Button>
      <Input :model-value="query" aria-label="搜索聊天记录" placeholder="搜索聊天记录" @update:model-value="emit('query', String($event))" />
      <nav class="agent-history-list" aria-label="历史聊天">
        <button v-for="item in items" :key="item.id" type="button" class="agent-history-item" :class="{ 'is-active': item.id === activeId }" :aria-current="item.id === activeId ? 'true' : undefined" :aria-label="item.title" :title="item.title" :disabled="busy" @click="emit('select', item.id)">
          <span>{{ item.title }}</span><small v-if="item.status">{{ item.status }}</small>
        </button>
        <p v-if="!items.length" class="agent-history-empty" role="status">没有匹配的聊天</p>
      </nav>
    </aside>
    </Transition>
    <div class="agent-history-main">
      <div v-if="!expanded" class="agent-history-toolbar"><Button variant="ghost" size="sm" aria-label="展开聊天记录" @click="expanded = true"><PanelLeftOpenIcon :size="16" />聊天记录</Button></div>
      <div class="agent-history-workspace"><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.agent-history-layout { display:flex; width:100%; height:100%; min-width:0; min-height:0; overflow:hidden; }
.agent-history { display:flex; flex-direction:column; gap:14px; width:224px; flex-shrink:0; padding:16px 12px; border-right:1px solid var(--border); background:color-mix(in srgb,var(--muted) 40%,var(--background)); }
.agent-history-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:13px; }
.agent-history-list { display:flex; flex-direction:column; gap:4px; flex:1; min-height:0; overflow-y:auto; }
.agent-history-item { display:flex; flex-direction:column; gap:4px; width:100%; flex-shrink:0; min-width:0; padding:11px 12px; border:0; border-radius:8px; text-align:left; background:transparent; color:var(--foreground); font:inherit; font-size:13px; cursor:pointer; }
.agent-history-item>span { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.agent-history-item>small { color:var(--muted-foreground); font-size:11px; }
.agent-history-item:hover:not(:disabled),.agent-history-item.is-active { background:var(--muted); }
.agent-history-item:focus-visible { outline:2px solid var(--ring); outline-offset:-2px; }
.agent-history-item:disabled { cursor:default; opacity:.65; }
.agent-history-empty { margin:8px; font-size:12px; color:var(--muted-foreground); }
.agent-history-main { display:flex; flex-direction:column; flex:1; min-height:0; min-width:0; }
.agent-history-toolbar { padding:8px 12px 0; flex-shrink:0; }
.agent-history-workspace { flex:1; min-height:0; min-width:0; overflow:hidden; }
.agent-history-enter-active,.agent-history-leave-active { transition:width .2s ease,padding .2s ease,opacity .2s ease,max-height .2s ease; overflow:hidden; }
.agent-history-enter-from,.agent-history-leave-to { width:0; padding-left:0; padding-right:0; opacity:0; }
.agent-sidebar-panel .agent-history-layout { flex-direction:column; }
.agent-sidebar-panel .agent-history { width:100%; max-height:210px; flex-shrink:0; border-right:0; border-bottom:1px solid var(--border); padding:10px 12px; gap:8px; }
.agent-sidebar-panel .agent-history-enter-from,.agent-sidebar-panel .agent-history-leave-to { max-height:0; padding-top:0; padding-bottom:0; }
@media(max-width:650px) { .agent-history-layout { flex-direction:column; } .agent-history { width:100%; max-height:220px; border-right:0; border-bottom:1px solid var(--border); padding:12px; gap:8px; } }
@media(max-width:650px) { .agent-history-enter-from,.agent-history-leave-to { max-height:0; padding-top:0; padding-bottom:0; } }
@media(prefers-reduced-motion:reduce) { .agent-history-enter-active,.agent-history-leave-active { transition:none; } }
</style>
