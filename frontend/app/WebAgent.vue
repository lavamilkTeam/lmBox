<script setup lang="ts">
import { AgentWorkspace } from '../modules/agent'
import { AppTheme } from '../ui/theme'
</script>
<template>
  <AppTheme><main class="web-agent" aria-label="lmBox Agent"><AgentWorkspace /></main></AppTheme>
</template>
<style scoped>
.web-agent { height: 100dvh; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
</style>
