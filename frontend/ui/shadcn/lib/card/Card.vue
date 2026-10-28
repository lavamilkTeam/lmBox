<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "../utils"
import { cardVariants } from "./variants"
import type { CardVariants } from "./variants"

const props = withDefaults(defineProps<{
  class?: HTMLAttributes["class"]
  variant?: CardVariants["variant"]
}>(), { variant: 'default' })
</script>

<template>
  <div
    data-slot="card"
    :data-variant="variant"
    :class="
      cn(
        cardVariants({ variant }),
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
