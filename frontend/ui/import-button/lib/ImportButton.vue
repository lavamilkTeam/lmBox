<script setup lang="ts">
import { Download } from '@lucide/vue'
import { IconButton } from '../../icon-button'

withDefaults(defineProps<{ label?: string; tooltip?: string; disabled?: boolean }>(), {
  label: '导入', tooltip: '导入', disabled: false,
})
</script>

<template>
  <IconButton :label="label" :tooltip="tooltip" :disabled="disabled">
    <Download :size="24" :stroke-width="2" aria-hidden="true" />
  </IconButton>
</template>
