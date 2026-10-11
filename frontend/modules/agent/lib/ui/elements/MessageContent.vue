<!-- AI Elements Vue, Copyright 2025 cwandev, Apache-2.0. Changed for lmBox: public shadcn import and wrapping for plain-text answers. See NOTICE. -->
<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '../../../../../ui/shadcn'
const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>
<template>
  <div :class="cn('flex w-fit min-w-0 flex-col gap-2 text-sm', 'group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground', 'group-[.is-assistant]:text-foreground', props.class)">
    <slot />
  </div>
</template>
