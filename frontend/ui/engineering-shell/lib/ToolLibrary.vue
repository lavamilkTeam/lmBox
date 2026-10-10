<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search } from '@lucide/vue'
import { Button, Input } from '../../shadcn'
const props = defineProps<{ tools: { id: string; label: string; category: string; available: boolean }[] }>()
const emit = defineEmits<{ open: [id: string] }>()
const query = ref('')
const filtered = computed(() => props.tools.filter(tool => `${tool.label}${tool.category}`.includes(query.value.trim())))
</script>
<template>
  <main class="tool-library" aria-label="功能库">
    <div class="tool-library-search"><Search :size="15" aria-hidden="true" /><Input v-model="query" aria-label="搜索功能库" placeholder="搜索功能…" /></div>
    <nav aria-label="可用功能">
      <section v-for="category in [...new Set(filtered.map(tool => tool.category))]" :key="category">
        <h2>{{ category }}</h2>
        <Button v-for="tool in filtered.filter(tool => tool.category === category)" :key="tool.id" variant="ghost" :disabled="!tool.available" @click="emit('open', tool.id)">{{ tool.label }}<span v-if="!tool.available">未接入</span></Button>
      </section>
      <p v-if="!filtered.length" role="status">没有匹配的功能</p>
    </nav>
  </main>
</template>
<style scoped>
.tool-library{padding:24px;max-width:760px;margin:0 auto}.tool-library-search{position:relative;max-width:360px;margin-bottom:24px}.tool-library-search>svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--muted-foreground);pointer-events:none}.tool-library-search :deep(input){padding-left:32px;font-size:12px}.tool-library nav{display:grid;gap:24px}.tool-library h2{font-size:12px;font-weight:600;margin:0 0 8px}.tool-library section>button{display:flex;justify-content:space-between;width:100%;height:34px;padding:0 10px;font-size:12px}.tool-library section>button span{font-size:11px}.tool-library p{font-size:12px}@media(max-width:600px){.tool-library{padding:16px}}
</style>
