<script setup lang="ts">
import { ref, computed } from 'vue'
import { CircuitBoard, FlaskConical, Wind, GripVertical, Plus, Search, ChevronDown } from '@lucide/vue'
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
    <div class="guide-library-heading"><span>功能库</span><span class="guide-count">{{ tools.length }}</span></div>
    <p class="guide-library-hint">拖入画布，开始组织你的工作</p>
    <label class="guide-search"><Search :size="15" /><input v-model="query" aria-label="搜索功能" placeholder="搜索功能…" /></label>
    <nav aria-label="引导功能库">
      <section v-for="category in [...new Set(filtered.map(tool => tool.category))]" :key="category" class="guide-category">
        <h2><ChevronDown :size="13" />{{ category }}</h2>
        <button v-for="tool in filtered.filter(tool => tool.category === category)" :key="tool.id" class="guide-tool" :data-kind="tool.kind"
          draggable="true" :aria-label="`添加${tool.label}`" @dragstart="drag($event, tool.id)" @click="emit('add', tool.id)">
          <span class="guide-tool-icon"><CircuitBoard v-if="tool.kind === 'electrical'" :size="18" /><FlaskConical v-else-if="tool.kind === 'chemistry'" :size="18" /><Wind v-else :size="18" /></span>
          <span class="guide-tool-copy"><strong>{{ tool.label }}</strong><small>{{ tool.available ? '可打开工作区' : '工作区待接入' }}</small></span>
          <GripVertical class="guide-grip" :size="15" /><Plus class="guide-plus" :size="15" />
        </button>
      </section>
      <p v-if="!filtered.length" class="guide-library-hint">没有匹配的功能</p>
    </nav>
    <div class="guide-library-note"><Plus :size="15" /><span>也可以点击功能，添加到画布。</span></div>
  </aside>
</template>
