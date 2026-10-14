<script setup lang="ts">
import { CircleHelp } from '@lucide/vue'
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '../../shadcn'

defineProps<{ label: string }>()
</script>

<template>
  <Tooltip :delay-duration="150">
    <TooltipTrigger as-child>
      <Button type="button" variant="ghost" size="icon" class="help-tip-button" :aria-label="label">
        <CircleHelp :size="16" aria-hidden="true" />
      </Button>
    </TooltipTrigger>
    <TooltipContent side="top" class="help-tip-content"><slot /></TooltipContent>
  </Tooltip>
</template>

<style scoped>
.help-tip-button { width:24px; height:24px; padding:0; flex:0 0 auto; border-radius:50%; color:var(--muted-foreground); cursor:help; vertical-align:middle; }
.help-tip-content { max-width:min(320px, calc(100vw - 32px)); font-size:12px; line-height:1.7; font-weight:400; overflow-wrap:anywhere; }
.help-tip-content :deep(p) { margin:0; }
.help-tip-content :deep(p + p) { margin-top:6px; }
</style>
