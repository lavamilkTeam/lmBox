<!-- AI Elements Vue, Copyright 2025 cwandev, Apache-2.0. Changed for lmBox: public shadcn import. See NOTICE. -->
<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '../../../../../ui/shadcn'
const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>
<template><div :class="cn('flex flex-col gap-8 p-4', props.class)"><slot /></div></template>
