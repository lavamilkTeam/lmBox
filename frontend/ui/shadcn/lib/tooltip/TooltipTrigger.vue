<script setup lang="ts">
import type { TooltipTriggerProps } from "reka-ui"
import { injectTooltipRootContext, Primitive, TooltipTrigger } from "reka-ui"
import { inject } from "vue"
import { tooltipContentId } from "./accessibility"

const props = defineProps<TooltipTriggerProps>()
const root = injectTooltipRootContext()
const contentId = inject(tooltipContentId)
function enter(event: PointerEvent) {
  // A direct move between triggers must not inherit the previous bubble's grace area.
  if (event.pointerType !== 'touch' && !root.disabled.value && !(event.currentTarget as HTMLElement).hasAttribute('disabled')) root.onTriggerEnter()
}
</script>

<template>
  <TooltipTrigger
    data-slot="tooltip-trigger"
    v-bind="props"
    as-child
    @pointerenter="enter"
  >
    <Primitive
      :as="props.as ?? 'button'"
      :as-child="props.asChild"
      :aria-describedby="root.open.value ? contentId : undefined"
    >
      <slot />
    </Primitive>
  </TooltipTrigger>
</template>
