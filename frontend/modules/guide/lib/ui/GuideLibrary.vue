<script setup lang="ts">
import { ref, computed } from 'vue'
import { GripVertical, Plus, Search } from '@lucide/vue'
import { Badge, Button, Input } from '../../../../ui/shadcn'
import type { ToolView } from './types'
const props = defineProps<{ tools: readonly ToolView[] }>()
const emit = defineEmits<{ add: [id: string] }>()
const query = ref('')
const filtered = computed(() => props.tools.filter(tool => `${tool.label}${tool.category}`.includes(query.value.trim())))
function drag(event: DragEvent, id: string) {
  if (!event.dataTransfer) return
  event.dataTransfer.setData('application/x-lmbox-guide-tool', id)
  event.dataTransfer.effectAllowed = 'copy'
}
</script>
<template>
  <aside class="guide-library" aria-label="功能列表">
    <div class="guide-library-heading"><span>功能库</span><Badge variant="secondary" class="guide-count">{{ tools.length }}</Badge></div>
    <label class="guide-search"><Search :size="15" /><Input v-model="query" class="guide-search-input" aria-label="搜索功能" placeholder="搜索功能…" /></label>
    <nav aria-label="引导功能库">
      <section v-for="category in [...new Set(filtered.map(tool => tool.category))]" :key="category" class="guide-category">
        <h2>{{ category }}</h2>
        <Button variant="ghost" size="sm" v-for="tool in filtered.filter(tool => tool.category === category)" :key="tool.id" class="guide-tool"
          draggable="true" :aria-label="`添加${tool.label}`" @dragstart="drag($event, tool.id)" @click="emit('add', tool.id)">
          <span class="guide-tool-copy"><strong>{{ tool.label }}</strong></span>
          <GripVertical class="guide-grip" :size="15" /><Plus class="guide-plus" :size="15" />
        </Button>
      </section>
      <p v-if="!filtered.length" class="guide-search-empty" role="status">没有匹配的功能</p>
    </nav>
  </aside>
</template>
