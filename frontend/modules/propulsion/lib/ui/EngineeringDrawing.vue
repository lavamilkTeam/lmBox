<script setup lang="ts">
import { computed } from 'vue'
import { drawingSvg, type DrawingSpec } from './drawing'
const props = defineProps<{ drawing: DrawingSpec }>()
const svg = computed(() => drawingSvg(props.drawing))
</script>
<template><div class="sheet-viewport" data-testid="engineering-drawing"><div class="drawing-sheet" v-html="svg" /></div></template>
