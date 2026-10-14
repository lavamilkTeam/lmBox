<script setup lang="ts">
import { Input } from '../../../../ui/shadcn'
withDefaults(defineProps<{ modelValue: number; label: string; unit?: string; scale?: number; min?: number; max?: number; step?: number | string }>(), { unit: '', scale: 1, step: 'any' })
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
</script>
<template><label class="quantity-field"><span>{{ label }}<small>{{ unit }}</small></span><Input type="number" required :aria-label="label" :model-value="Number.isFinite(modelValue) ? modelValue / scale : ''" :min="min" :max="max" :step="step" @update:model-value="value => emit('update:modelValue', value === '' ? NaN : Number(value) * scale)" /></label></template>
