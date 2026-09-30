<script setup lang="ts">
import { FileBox, Plus, X } from '@lucide/vue'
import { useProjectStore } from '../../../domain/project'
const store = useProjectStore()
defineEmits<{ import: []; close: [id: string] }>()
</script>
<template>
  <div class="document-bar">
    <span class="tabs-caption">工作区</span>
    <div class="document-tabs" role="tablist" aria-label="Gerber 文件">
      <div v-for="doc in store.documents" :key="doc.id" class="document-tab" :class="{ active: doc.id === store.activeId }">
        <button role="tab" :aria-selected="doc.id === store.activeId" @click="store.activate(doc.id)"><FileBox :size="15"/><span>{{ doc.name }}</span></button>
        <button class="tab-close" :aria-label="`关闭 ${doc.name}`" @click="$emit('close', doc.id)"><X :size="13"/></button>
      </div>
    </div>
    <button class="icon-button new-tab" title="导入另一个文件" aria-label="新建文件标签" @click="$emit('import')"><Plus :size="17"/></button>
    <span class="tab-count">{{ store.documents.length }} 个文件</span>
  </div>
</template>
