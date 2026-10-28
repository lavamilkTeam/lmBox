<script setup lang="ts">
import { ref, computed } from 'vue'
import { GripVertical, Plus, Search } from '@lucide/vue'
import { Badge, Button, Input } from '../../shadcn'
import type { ToolView } from './types'
const props = withDefaults(defineProps<{
  tools: readonly ToolView[]; title?: string; label?: string; navigationLabel?: string; searchLabel?: string; placeholder?: string
}>(), { title: '功能库', label: '功能列表', navigationLabel: '引导功能库', searchLabel: '搜索功能', placeholder: '搜索功能…' })
const emit = defineEmits<{ add: [id: string] }>()
defineSlots<{ 'tool-actions'?: (props: { tool: ToolView }) => unknown }>()
const query = ref('')
const filtered = computed(() => props.tools.filter(tool => `${tool.label}${tool.category}`.toLowerCase().includes(query.value.trim().toLowerCase())))
function drag(event: DragEvent, id: string) {
  if (!event.dataTransfer) return
  event.dataTransfer.setData('application/x-lmbox-guide-tool', id)
  event.dataTransfer.effectAllowed = 'copy'
}
</script>
<template>
  <aside class="guide-library" :aria-label="label">
    <div class="guide-library-heading"><span>{{ title }}</span><Badge variant="secondary" class="guide-count">{{ tools.length }}</Badge></div>
    <div class="guide-search"><Search class="guide-search-icon" :size="15" aria-hidden="true" /><Input v-model="query" class="guide-search-input" :aria-label="searchLabel" :placeholder="placeholder" /></div>
    <nav :aria-label="navigationLabel">
      <section v-for="category in [...new Set(filtered.map(tool => tool.category))]" :key="category" class="guide-category">
        <h2>{{ category }}</h2>
        <div v-for="tool in filtered.filter(tool => tool.category === category)" :key="tool.id" class="guide-tool-row">
          <Button variant="ghost" size="sm" class="guide-tool"
            draggable="true" :aria-label="`添加${tool.label}`" @dragstart="drag($event, tool.id)" @click="emit('add', tool.id)">
            <span class="guide-tool-copy"><strong>{{ tool.label }}</strong></span>
            <GripVertical class="guide-grip" :size="15" /><Plus class="guide-plus" :size="15" />
          </Button>
          <div v-if="$slots['tool-actions']" class="guide-tool-actions" @click.stop @pointerdown.stop @dragstart.stop.prevent>
            <slot name="tool-actions" :tool="tool" />
          </div>
        </div>
      </section>
      <p v-if="!filtered.length" class="guide-search-empty" role="status">没有匹配的功能</p>
    </nav>
  </aside>
</template>
