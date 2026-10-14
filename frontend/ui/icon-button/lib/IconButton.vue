<script setup lang="ts">
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '../../shadcn'

defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{
  label: string
  tooltip?: string
  disabled?: boolean
  placement?: 'top' | 'right' | 'bottom' | 'left'
}>(), { disabled: false, placement: 'right' })
</script>

<template>
  <Tooltip :delay-duration="150">
    <TooltipTrigger as-child>
      <Button v-bind="$attrs" type="button" variant="ghost" size="icon" class="icon-button"
        :disabled="disabled" :aria-label="label"><slot /></Button>
    </TooltipTrigger>
    <TooltipContent :side="placement" class="icon-button-tooltip"><slot name="tooltip">{{ tooltip ?? label }}</slot></TooltipContent>
  </Tooltip>
</template>

<style scoped>
.icon-button { width:32px; height:32px; flex:0 0 auto; padding:0; }
.icon-button-tooltip { max-width:min(280px, calc(100vw - 24px)); font-size:12px; line-height:1.5; overflow-wrap:anywhere; }
</style>
