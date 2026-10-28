<!-- AI Elements Vue, Copyright 2025 cwandev, Apache-2.0. Changed for lmBox: controlled submit/slots; file I/O and request ownership remain outside UI. See NOTICE. -->
<script setup lang="ts">
import { Card } from '../../../../../ui/shadcn'
const emit = defineEmits<{ submit: [] }>()
</script>
<template><form class="agent-composer" @submit.prevent="emit('submit')"><Card variant="floating" class="agent-composer-card"><slot /></Card></form></template>
