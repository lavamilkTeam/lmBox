<script setup lang="ts">
import { NInputNumber } from 'naive-ui'
withDefaults(defineProps<{label:string;value:number;min?:number;max?:number;step?:number;unit?:string;disabled?:boolean}>(),{step:.1,unit:'mm'})
const emit=defineEmits<{change:[value:number]}>()
</script>
<template><div><label class="field-label">{{ label }} <span>{{ unit }}</span></label><NInputNumber :input-props="{'aria-label':label}" :value="value" :min="min" :max="max" :step="step" :disabled="disabled" size="small" @update:value="v=>v!==null && emit('change',v)"/></div></template>
