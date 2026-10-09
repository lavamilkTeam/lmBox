<script setup lang="ts">
import { File, Plus, X } from '@lucide/vue'
import { useProjectStore } from '../../../domain/project'
const store = useProjectStore()
defineEmits<{ import: []; close: [id: string] }>()
</script>
<template>
  <div class="document-bar">
    <span class="tabs-caption">工作区</span>
    <div class="document-tabs" role="tablist" aria-label="Gerber 文件">
      <div v-for="doc in store.documents" :key="doc.id" class="document-tab" :class="{ active: doc.id === store.activeId }">
        <button role="tab" :aria-selected="doc.id === store.activeId" :title="doc.name" @click="store.activate(doc.id)"><File :size="14" :stroke-width="1.7" aria-hidden="true"/><span>{{ doc.name }}</span></button>
        <button class="tab-close" :aria-label="`关闭 ${doc.name}`" @click="$emit('close', doc.id)"><X :size="13" :stroke-width="1.7" aria-hidden="true"/></button>
      </div>
    </div>
    <button class="icon-button new-tab" title="导入另一个文件" aria-label="新建文件标签" @click="$emit('import')"><Plus :size="17"/></button>
    <span class="tab-count">{{ store.documents.length }} 个文件</span>
  </div>
</template>

<style scoped>
.document-bar {
  height: 42px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8px;
  padding: 0 15px 0 18px;
  background: #f5f5f5;
  border-bottom: 1px solid #e5e5e5;
}
.tabs-caption { margin-right: 8px; font-size: 10px; color: #8c8c8c; letter-spacing: .5px; }
.document-tabs {
  display: flex;
  align-items: center;
  min-width: 0;
  height: 100%;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.document-tab {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  height: 30px;
  min-width: 140px;
  max-width: 240px;
  border-radius: 8px;
  color: #737373;
  transition: background-color .15s, box-shadow .15s;
}
.document-tab:hover { background: #00000004; }
.document-tab.active {
  background: #fff;
  color: #262626;
  box-shadow: 0 1px 3px #0000000d, inset 0 0 0 1px #00000006;
}
.document-tab > button:first-child {
  flex: 1;
  min-width: 0;
  height: 100%;
  justify-content: flex-start;
  gap: 7px;
  padding: 0 8px 0 10px;
  border-radius: 8px;
}
.document-tab > button > span { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.document-tab > button:first-child > svg { color: #8c8c8c; }
.document-tab.active > button:first-child > svg { color: #666; }
.tab-close {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  margin-right: 4px;
  padding: 0;
  border-radius: 6px;
  color: #a3a3a3;
}
.tab-close:hover { background: #00000008; color: #404040; }
.new-tab { flex-shrink: 0; }
.tab-count { margin-left: auto; font-size: 10px; color: #a3a3a3; white-space: nowrap; }
@media (max-width: 820px) {
  .document-bar { padding-left: 10px; }
  .tabs-caption { display: none; }
}
@media (max-width: 600px) {
  .document-tab { min-width: 125px; }
  .tab-count { display: none; }
}
@media (prefers-reduced-motion: reduce) { .document-tab { transition: none; } }
</style>
