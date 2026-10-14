<script setup lang="ts">
import type { TooltipContentEmits, TooltipContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { inject } from "vue"
import { TooltipArrow, TooltipContent, TooltipPortal, useForwardPropsEmits } from "reka-ui"
import { cn } from "../utils"
import { tooltipContentId } from "./accessibility"

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<TooltipContentProps & { class?: HTMLAttributes["class"] }>(), {
  sideOffset: 4,
  collisionPadding: 8,
})

const emits = defineEmits<TooltipContentEmits>()
const contentId = inject(tooltipContentId)

const delegatedProps = reactiveOmit(props, "class")
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <TooltipPortal>
    <TooltipContent
      data-slot="tooltip-content"
      v-bind="{ ...forwarded, ...$attrs }"
      :id="contentId"
      role="tooltip"
      aria-label=" "
      :class="cn('bg-foreground text-background animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit rounded-md px-3 py-1.5 text-xs text-balance', props.class)"
    >
      <slot />

      <TooltipArrow class="bg-foreground fill-foreground z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-xs" />
    </TooltipContent>
  </TooltipPortal>
</template>

<style>
[data-slot="tooltip-content"] {
  max-width: min(320px, calc(100vw - 32px));
  white-space: normal;
  overflow-wrap: anywhere;
}
/* Describe the visible, hoverable bubble; Reka's duplicate text span is unnecessary. */
[data-slot="tooltip-content"] > span[role="tooltip"] {
  display: none;
}
</style>
