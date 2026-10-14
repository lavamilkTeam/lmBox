<script setup lang="ts">
import { File, Plus, X } from '@lucide/vue'
import { Button, Tabs, TabsList, TabsTrigger } from '../../../../../../ui/shadcn'
import { useProjectStore } from '../../../domain/project'
const store = useProjectStore()
defineEmits<{ import: []; close: [id: string] }>()
</script>
<template>
  <div class="document-bar">
    <span class="tabs-caption">工作区</span>
    <Tabs class="document-tabs-root" :model-value="store.activeId" @update:model-value="store.activate(String($event))">
      <TabsList class="document-tabs" aria-label="Gerber 文件">
        <div v-for="doc in store.documents" :key="doc.id" class="document-tab" :class="{ active: doc.id === store.activeId }">
          <TabsTrigger :id="`stencil-document-tab-${doc.id}`" :value="doc.id" :aria-controls="`stencil-document-${doc.id}`" :title="doc.name"><File :size="14" :stroke-width="1.7" aria-hidden="true"/><span>{{ doc.name }}</span></TabsTrigger>
          <Button variant="ghost" size="icon" class="tab-close" :aria-label="`关闭 ${doc.name}`" @click="$emit('close', doc.id)"><X :size="13" :stroke-width="1.7" aria-hidden="true"/></Button>
        </div>
      </TabsList>
    </Tabs>
    <Button variant="ghost" size="icon" class="icon-button new-tab" title="导入另一个文件" aria-label="新建文件标签" @click="$emit('import')"><Plus :size="17"/></Button>
    <span class="tab-count">{{ store.documents.length }} 个文件</span>
  </div>
</template>
