<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { NTooltip } from 'naive-ui'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{
  label: string
  tooltip?: string
  disabled?: boolean
  placement?: 'top' | 'right' | 'bottom' | 'left'
}>(), { disabled: false, placement: 'right' })
const id = useId()
const hovered = ref(false)
const focused = ref(false)
const shown = computed(() => !props.disabled && (hovered.value || focused.value))
function dismiss() {
  hovered.value = false
  focused.value = false
}
function focus(event: FocusEvent) {
  focused.value = (event.currentTarget as HTMLElement).matches(':focus-visible')
}
</script>

<template>
  <NTooltip :show="shown" trigger="hover" :placement="placement" :show-arrow="false"
    :delay="150" :duration="120"
    :style="{
      background: '#ededee', color: '#333', borderRadius: '10px',
      padding: '7px 12px', boxShadow: '0 3px 12px #00000012, inset 0 0 0 1px #00000006',
      maxWidth: 'min(280px, calc(100vw - 24px))',
    }"
    @update:show="hovered = $event">
    <template #trigger>
      <button v-bind="$attrs" type="button" class="icon-button" :disabled="disabled"
        :aria-label="label" :aria-describedby="shown ? id : undefined"
        @focus="focus" @blur="focused = false" @keydown.esc.stop="dismiss">
        <slot />
      </button>
    </template>
    <div :id="id" role="tooltip" class="icon-button-tooltip"><slot name="tooltip">{{ tooltip ?? label }}</slot></div>
  </NTooltip>
</template>

<style scoped>
.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #000;
  transition: background-color .15s, box-shadow .15s;
}
.icon-button:hover:not(:disabled), .icon-button:focus-visible {
  background: #00000008;
  box-shadow: 0 2px 7px #00000012;
  color: #000;
}
.icon-button:active:not(:disabled) { background: #00000010; }
.icon-button:focus-visible { outline: 2px solid #262626; outline-offset: 2px; }
.icon-button-tooltip { font-size: 12px; line-height: 1.5; font-weight: 400; overflow-wrap: anywhere; }
@media (prefers-reduced-motion: reduce) { .icon-button { transition: none; } }
</style>
