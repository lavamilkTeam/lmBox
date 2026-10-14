<!-- Adapted from AI Elements Vue Tool, Copyright 2025 cwandev, Apache-2.0. Changed for lmBox: actual progress entries, local shadcn imports; no invented per-tool states. See NOTICE. -->
<script setup lang="ts">
import { ChevronDownIcon } from '@lucide/vue'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../../../ui/shadcn'
defineProps<{ events: string[]; running: boolean }>()
</script>
<template>
  <Collapsible class="agent-execution group" :default-open="running">
    <CollapsibleTrigger class="agent-execution-trigger"><span>执行记录</span><span>{{ events.length }}</span><ChevronDownIcon :size="14" class="transition-transform group-data-[state=open]:rotate-180" /></CollapsibleTrigger>
    <CollapsibleContent><ol class="agent-execution-events"><li v-for="(event, index) in events" :key="index">{{ event }}</li></ol></CollapsibleContent>
  </Collapsible>
</template>
