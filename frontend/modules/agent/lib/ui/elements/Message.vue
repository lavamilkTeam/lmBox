<!-- AI Elements Vue, Copyright 2025 cwandev, Apache-2.0. Changed for lmBox: local role type and public shadcn imports. See NOTICE. -->
<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '../../../../../ui/shadcn'
const props = defineProps<{ from: 'user' | 'assistant'; class?: HTMLAttributes['class'] }>()
</script>
<template>
  <div :class="cn('group flex w-full max-w-[80%] gap-2', from === 'user' ? 'is-user ml-auto justify-end' : 'is-assistant', props.class)">
    <slot />
  </div>
</template>
