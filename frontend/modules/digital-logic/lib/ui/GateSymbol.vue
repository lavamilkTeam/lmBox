<script setup lang="ts">
import { logicGateSymbols } from './symbols'
defineProps<{ gateId: string; label: string }>()
const emit = defineEmits<{
  moveStart: [event: PointerEvent]; moveEnd: []; keyboardMove: [event: KeyboardEvent]; remove: []
}>()
function keydown(event: KeyboardEvent) {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    event.stopPropagation()
    emit('remove')
  } else emit('keyboardMove', event)
}
</script>
<template>
  <button type="button" class="logic-gate-symbol" :aria-label="`移动${label}`" :title="label"
    @pointerdown="emit('moveStart', $event)" @pointerup="emit('moveEnd')" @pointercancel="emit('moveEnd')"
    @lostpointercapture="emit('moveEnd')" @keydown="keydown">
    <img :src="logicGateSymbols[gateId]" :alt="`${label}符号`" draggable="false" />
  </button>
</template>
<style scoped>
.logic-gate-symbol { display: block; width: 100%; height: 100%; margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; cursor: grab; touch-action: none; user-select: none; }
.logic-gate-symbol:active { cursor: grabbing; }
.logic-gate-symbol:focus-visible { outline: none; filter: drop-shadow(0 0 2px #377663); }
.logic-gate-symbol img { display: block; width: 100%; height: 100%; pointer-events: none; }
</style>
