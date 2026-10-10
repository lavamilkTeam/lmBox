<script setup lang="ts">
import { NumberField as NumericField, NumberFieldContent, NumberFieldInput, NumberFieldIncrement, NumberFieldDecrement } from '../../../../../../ui/shadcn'
const props = withDefaults(defineProps<{label:string;value:number;min?:number;max?:number;step?:number;unit?:string;disabled?:boolean}>(),{step:.1,unit:'mm'})
const emit=defineEmits<{change:[value:number]}>()
function input(event: Event) {
  const text = (event.target as HTMLInputElement).value.trim()
  // Keep unfinished decimals editable while publishing valid drafts immediately.
  if (!text || text.endsWith('.') || /^-0(?:\.0*)?$/.test(text)) return
  const value = Number(text)
  if (Number.isFinite(value) && (props.min === undefined || value >= props.min) && (props.max === undefined || value <= props.max)) emit('change', value)
}
</script>
<template>
  <div>
    <label class="field-label"><span>{{ label }} <slot name="help" /></span><span>{{ unit }}</span></label>
    <NumericField class="parameter-number" :model-value="value" :min="min" :max="max" :step="step" :disabled="disabled" :step-snapping="false" :format-options="{useGrouping:false,maximumFractionDigits:20}" @update:model-value="v => typeof v === 'number' && Number.isFinite(v) && emit('change',v)">
      <NumberFieldContent><NumberFieldDecrement :aria-label="`减少 ${label}`"/><NumberFieldInput :aria-label="label" @input="input"/><NumberFieldIncrement :aria-label="`增加 ${label}`"/></NumberFieldContent>
    </NumericField>
  </div>
</template>
