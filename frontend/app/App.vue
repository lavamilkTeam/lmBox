<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { AppTheme } from '../ui/theme'

const StencilWorkspace = defineAsyncComponent(() =>
  import('../modules/stencil').then(module => module.StencilWorkspace),
)
</script>

<template>
  <AppTheme><StencilWorkspace /></AppTheme>
</template>
