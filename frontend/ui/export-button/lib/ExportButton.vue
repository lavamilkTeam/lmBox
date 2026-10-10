<script setup lang="ts">
import { Upload } from '@lucide/vue'
import { IconButton } from '../../icon-button'

withDefaults(defineProps<{ label?: string; tooltip?: string; disabled?: boolean }>(), {
  label: '导出', tooltip: '导出', disabled: false,
})
</script>

<template>
  <IconButton :label="label" :tooltip="tooltip" :disabled="disabled" placement="left">
    <Upload :size="24" :stroke-width="2" aria-hidden="true" />
  </IconButton>
</template>
