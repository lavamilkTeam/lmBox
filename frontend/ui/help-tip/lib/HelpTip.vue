<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { NTooltip } from 'naive-ui'
import { CircleHelp } from '@lucide/vue'

defineProps<{ label: string }>()
const id = useId()
const hovered = ref(false)
const focused = ref(false)
const shown = computed(() => hovered.value || focused.value)
function dismiss() {
  hovered.value = false
  focused.value = false
}
</script>

<template>
  <NTooltip :show="shown" trigger="hover" placement="top" :delay="150" :duration="120"
    :style="{ maxWidth: 'min(320px, calc(100vw - 32px))' }"
    @update:show="hovered = $event">
    <template #trigger>
      <button type="button" class="help-tip-button" :aria-label="label"
        :aria-describedby="shown ? id : undefined"
        @focus="focused = true" @blur="focused = false" @keydown.esc.stop="dismiss">
        <CircleHelp :size="16" aria-hidden="true" />
      </button>
    </template>
    <div :id="id" role="tooltip" class="help-tip-content"><slot /></div>
  </NTooltip>
</template>

<style scoped>
.help-tip-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #737373;
  cursor: help;
  vertical-align: middle;
}
.help-tip-button:hover, .help-tip-button:focus-visible { color: #262626; background: #26262612; }
.help-tip-button:focus-visible { outline: 2px solid #262626; outline-offset: 2px; }
.help-tip-content { font-size: 12px; line-height: 1.7; font-weight: 400; overflow-wrap: anywhere; }
.help-tip-content :deep(p) { margin: 0; }
.help-tip-content :deep(p + p) { margin-top: 6px; }
</style>
