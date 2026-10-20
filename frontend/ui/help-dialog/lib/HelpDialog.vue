<script setup lang="ts">
import { CircleHelp } from '@lucide/vue'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../shadcn'

defineProps<{
  open: boolean; title: string; description: string; imageSrc?: string; imageAlt?: string
  source?: { label: string; url: string }
}>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogTrigger as-child>
      <Button type="button" variant="ghost" size="icon" class="help-dialog-trigger"
        :aria-label="`${title}说明`" aria-haspopup="dialog">
        <CircleHelp :size="16" aria-hidden="true" />
      </Button>
    </DialogTrigger>
    <DialogContent class="help-dialog-content" :class="{ 'has-image': imageSrc }">
      <img v-if="open && imageSrc" :src="imageSrc" :alt="imageAlt || `${title}教程`" class="help-dialog-image" />
      <DialogHeader class="help-dialog-header">
        <DialogTitle class="help-dialog-title">{{ title }}</DialogTitle>
        <DialogDescription class="help-dialog-description">{{ description }}</DialogDescription>
      </DialogHeader>
      <a v-if="source" :href="source.url" class="help-dialog-source" target="_blank" rel="noopener noreferrer">{{ source.label }}</a>
      <slot />
    </DialogContent>
  </Dialog>
</template>

<style>
.help-dialog-trigger { width:24px; height:24px; padding:0; flex:0 0 auto; border-radius:50%; color:var(--muted-foreground); cursor:pointer; }
.help-dialog-trigger:hover, .help-dialog-trigger:focus-visible { color:var(--foreground); }
.help-dialog-content { width:calc(100vw - 32px); max-width:420px; max-height:calc(100dvh - 48px); overflow-y:auto; gap:16px; padding:24px; overflow-wrap:anywhere; transition-property:none; }
.help-dialog-content.has-image { max-width:720px; }
.help-dialog-image { display:block; width:100%; height:auto; }
.help-dialog-header { gap:12px; padding-right:16px; text-align:left; }
.help-dialog-title { font-size:16px; line-height:1.5; }
.help-dialog-description { color:var(--foreground); font-size:13px; line-height:1.8; white-space:pre-line; }
.help-dialog-source { justify-self:start; font-size:12px; line-height:1.5; color:var(--muted-foreground); text-decoration:underline; text-underline-offset:3px; }
.help-dialog-source:hover, .help-dialog-source:focus-visible { color:var(--foreground); }
</style>
