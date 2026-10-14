<script setup lang="ts">
import { computed } from 'vue'
import { Button, Checkbox, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../../../ui/shadcn'
import type { UiFlowData } from './types'
const props = defineProps<{ data?: UiFlowData; field: string; active: boolean; mesh: boolean; slice: boolean; streamlines: boolean; vectors: boolean; upAxis: 'x'|'y'|'z'; status?: string; error?: string }>()
const emit = defineEmits<{ 'update:upAxis': ['x'|'y'|'z']; 'update:field': [string]; 'update:active': [boolean]; 'update:mesh': [boolean]; 'update:slice': [boolean]; 'update:streamlines': [boolean]; 'update:vectors': [boolean] }>()
const selected = computed(()=>props.data?.fields.find(f=>f.id===props.field))
const format=(n:number)=>new Intl.NumberFormat('zh-CN',{maximumSignificantDigits:5}).format(n)
</script>
<template>
  <div class="cfd-flow-controls">
    <Button size="sm" :variant="active?'outline':'default'" @click="emit('update:active',false)">几何</Button>
    <Button size="sm" :variant="active?'default':'outline'" :disabled="!data" @click="emit('update:active',true)">流场</Button>
    <template v-if="active && data">
      <Select :model-value="field" @update:model-value="emit('update:field',String($event))"><SelectTrigger aria-label="显示物理量"><SelectValue/></SelectTrigger><SelectContent><SelectItem v-for="item in data.fields" :key="item.id" :value="item.id">{{ item.label }}{{ item.unit ? ` (${item.unit})` : '' }}</SelectItem></SelectContent></Select>
      <label><Checkbox :model-value="mesh" @update:model-value="emit('update:mesh',$event===true)"/>网格</label>
      <label><Checkbox :model-value="slice" @update:model-value="emit('update:slice',$event===true)"/>截面</label>
      <label><Checkbox :model-value="streamlines" @update:model-value="emit('update:streamlines',$event===true)"/>流线</label>
      <label><Checkbox :model-value="vectors" @update:model-value="emit('update:vectors',$event===true)"/>速度矢量</label>
      <DropdownMenu><DropdownMenuTrigger as-child><Button size="sm" variant="outline">视角</Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem v-for="axis in (['x','y','z'] as const)" :key="axis" @select="emit('update:upAxis',axis)">{{ axis.toUpperCase() }} 轴朝上</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      <span>结果时刻 {{ data.time }}</span>
      <span v-if="data.surface.truncated || data.slice.truncated || data.streamlines.truncated">显示已截断</span>
    </template>
    <span v-if="status==='loading'" role="status">读取流场…</span>
    <span v-if="error" role="alert">{{ error }}</span>
  </div>
  <div v-if="active && selected" class="cfd-field-legend" :aria-label="`${selected.label}色标`"><strong>{{ selected.label }} {{ selected.unit }}</strong><div/><span>{{ format(selected.range[0]) }}</span><span>{{ format(selected.range[1]) }}</span></div>
</template>
