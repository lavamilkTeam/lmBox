<script setup lang="ts">
import { computed, ref } from 'vue'
import { Terminal, Trash2, ChevronDown, ChevronUp } from '@lucide/vue'
import { useProjectStore } from '../../../domain/project'
const store = useProjectStore()
const collapsed = ref(false)
const filter = ref('all')
const logs = computed(() => (store.active?.logs ?? []).filter(l => filter.value === 'all' || l.level === filter.value))
</script>
<template>
  <section class="log-panel" :class="{ collapsed }" aria-label="运行日志">
    <header><span class="log-title"><Terminal :size="14"/>运行日志 <b>{{ store.active?.logs.length ?? 0 }}</b></span><div class="log-actions"><select v-model="filter" aria-label="日志级别"><option value="all">全部级别</option><option value="success">成功</option><option value="info">信息</option><option value="warning">提醒</option></select><button class="icon-button" title="清空日志" aria-label="清空日志" @click="store.active && (store.active.logs = [])"><Trash2 :size="13"/></button><button class="icon-button" :aria-label="collapsed ? '展开日志' : '收起日志'" @click="collapsed = !collapsed"><ChevronUp v-if="collapsed" :size="15"/><ChevronDown v-else :size="15"/></button></div></header>
    <div v-if="!collapsed" class="log-lines" role="log" aria-live="polite"><div v-for="entry in logs" :key="entry.id" class="log-line"><time>{{ entry.time }}</time><span class="log-level" :class="entry.level">{{ entry.level === 'success' ? 'SUCCESS' : entry.level === 'warning' ? 'WARN' : 'INFO' }}</span><span>{{ entry.message }}</span></div><p v-if="!logs.length" class="log-empty">暂无日志</p></div>
  </section>
</template>
