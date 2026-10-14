<script setup lang="ts">
import { X } from '@lucide/vue'
import { Button, TabsTrigger } from '../../shadcn'

defineProps<{ id: string; label: string; fixed?: boolean; active: boolean; beforeActive: boolean }>()
const emit = defineEmits<{ close: [id: string] }>()
</script>

<template>
  <div class="engineering-tab" :class="{ 'is-active': active, 'is-fixed': fixed, 'is-before-active': beforeActive }">
    <TabsTrigger :value="id" class="engineering-tab-trigger" :title="label" @keydown.delete="!fixed && ($event.preventDefault(), $event.stopPropagation(), emit('close', id))"><span>{{ label }}</span></TabsTrigger>
    <Button v-if="!fixed" variant="ghost" size="icon" class="engineering-tab-close" :aria-label="`关闭${label}页签`" @click="emit('close', id)"><X :size="14" /></Button>
  </div>
</template>
