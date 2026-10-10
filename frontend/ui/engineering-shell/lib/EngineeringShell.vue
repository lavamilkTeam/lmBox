<script setup lang="ts">
import { ref, watch } from 'vue'
import { ChevronDown, X, PanelsTopLeft } from '@lucide/vue'
import { Button, Popover, PopoverTrigger, PopoverContent } from '../../shadcn'
const props = withDefaults(defineProps<{ active: string; tools: { id: string; label: string; category: string }[]; showToolbox?: boolean }>(), { showToolbox: true })
const emit = defineEmits<{ select: [id: string] }>()
const open = ref(false)
watch(() => props.active, () => { open.value = false })
</script>
<template>
  <div class="engineering-shell">
    <header class="engineering-bar">
      <Popover v-if="showToolbox" v-model:open="open">
        <PopoverTrigger as-child><Button variant="outline" size="sm" class="toolbox-toggle"><PanelsTopLeft :size="15" />工程工具箱<ChevronDown :size="13" /></Button></PopoverTrigger>
        <PopoverContent align="start" class="engineering-toolbox">
          <nav aria-label="工程工具箱">
            <header><strong>工程工具箱</strong><Button variant="ghost" size="icon" aria-label="关闭工具箱" @click="open = false"><X :size="16" /></Button></header>
            <section v-for="category in [...new Set(tools.map(t => t.category))]" :key="category">
              <h2>{{ category }}</h2>
              <Button v-for="tool in tools.filter(t => t.category === category)" :key="tool.id" variant="ghost" :aria-current="active === tool.id ? 'page' : undefined" @click="emit('select', tool.id); open = false">{{ tool.label }}</Button>
            </section>
          </nav>
        </PopoverContent>
      </Popover>
      <span class="engineering-breadcrumb">{{ tools.find(t => t.id === active)?.category }} <span>/</span> <b>{{ tools.find(t => t.id === active)?.label }}</b></span>
    </header>
    <div class="engineering-content"><slot /></div>
  </div>
</template>
<style scoped>
.engineering-shell{height:100dvh;display:flex;flex-direction:column;overflow:hidden}.engineering-bar{height:42px;flex-shrink:0;display:flex;align-items:center;gap:20px;border-bottom:1px solid var(--border);background:var(--background);padding:0 16px;color:var(--muted-foreground);font-size:11px}.toolbox-toggle{height:28px}.engineering-breadcrumb span{margin:0 9px;color:var(--muted-foreground)}.engineering-breadcrumb b{font-weight:500;color:var(--foreground)}.engineering-content{min-height:0;flex:1;overflow:auto}.engineering-content :deep(.stencil-workspace .studio){height:calc(100dvh - 42px)}.engineering-toolbox{width:272px;padding:12px}.engineering-toolbox header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}.engineering-toolbox h2{font-size:11px;font-weight:500;color:var(--muted-foreground);margin:16px 8px 6px}.engineering-toolbox section>button{display:flex;justify-content:flex-start;width:100%;font-size:12px}.engineering-toolbox button[aria-current]{background:var(--accent);font-weight:600}@media(max-width:600px){.engineering-bar{gap:10px;padding:0 8px}.engineering-breadcrumb{font-size:10px}.engineering-breadcrumb span{margin:0 4px}}
</style>
