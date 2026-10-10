<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button, Checkbox, Input, NumberField, NumberFieldContent, NumberFieldInput, NumberFieldIncrement, NumberFieldDecrement, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Popover, PopoverTrigger, PopoverContent } from '../../../../ui/shadcn'
import { Plus, X } from '@lucide/vue'
import { chinese } from './chinese'
import type { UiValue } from './types'
const props=defineProps<{value:UiValue;label:string;type?:string;readOnly?:boolean;options?:string[];objects?:{id:string;label:string}[];subelements?:Record<string,string[]>}>()
const emit=defineEmits<{change:[value:UiValue]}>()
const object=computed(()=>props.value && typeof props.value==='object' && !Array.isArray(props.value)?props.value as Record<string,UiValue>:null)
const link=computed(()=>props.type?.includes('Link') && !Array.isArray(props.value))
const linkedId=computed(()=>String(object.value?.objectId ?? ''))
const linkedSubelements=computed(()=>Array.isArray(object.value?.subelements)?object.value!.subelements as string[]:[])
const newKey=ref('')
function updateKey(key:string,value:UiValue) {emit('change',{...object.value,[key]:value})}
function updateIndex(index:number,value:UiValue) {const values=[...(props.value as UiValue[])];values[index]=value;emit('change',values)}
function remove(index:number) {emit('change',(props.value as UiValue[]).filter((_,i)=>i!==index))}
function add() {emit('change',[...(props.value as UiValue[]),props.type?.includes('Link')?{objectId:''}:typeof (props.value as UiValue[])[0]==='number'?0:''])}
function addKey() {if(newKey.value && !Object.hasOwn(object.value??{},newKey.value)){updateKey(newKey.value,'');newKey.value=''}}
function removeKey(key:string) {const next={...object.value};delete next[key];emit('change',next)}
</script>
<template>
  <Select v-if="options?.length" :model-value="String(options.indexOf(String(value ?? '')))" :disabled="readOnly" @update:model-value="emit('change',options?.[Number($event)] ?? '')"><SelectTrigger :aria-label="label"><SelectValue/></SelectTrigger><SelectContent><SelectItem v-for="(option,index) in options" :key="index" :value="String(index)">{{ chinese(option) }}</SelectItem></SelectContent></Select>
  <div v-else-if="link" class="cfd-link-value"><Select :model-value="linkedId || '__none__'" :disabled="readOnly" @update:model-value="emit('change',type?.includes('Sub')?{objectId:$event==='__none__'?'':String($event),subelements:[]}:{objectId:$event==='__none__'?'':String($event)})"><SelectTrigger :aria-label="label"><SelectValue placeholder="无"/></SelectTrigger><SelectContent><SelectItem value="__none__">无</SelectItem><SelectItem v-for="item in objects" :key="item.id" :value="item.id">{{ chinese(item.label) }}</SelectItem></SelectContent></Select>
    <Popover v-if="type?.includes('Sub')"><PopoverTrigger as-child><Button variant="outline" size="sm" :disabled="readOnly || !linkedId">{{ linkedSubelements.length ? linkedSubelements.map(chinese).join('、') : '整个对象' }}</Button></PopoverTrigger><PopoverContent class="cfd-subelement-popover"><label v-for="subelement in subelements?.[linkedId]" :key="subelement" class="cfd-check"><Checkbox :model-value="linkedSubelements.includes(subelement)" @update:model-value="updateKey('subelements',$event===true?[...linkedSubelements,subelement]:linkedSubelements.filter(s=>s!==subelement))"/>{{ chinese(subelement) }}</label></PopoverContent></Popover>
  </div>
  <Checkbox v-else-if="typeof value === 'boolean'" :model-value="value" :aria-label="label" :disabled="readOnly" @update:model-value="emit('change',$event===true)"/>
  <NumberField v-else-if="typeof value === 'number'" :model-value="value" :step-snapping="false" :format-options="{useGrouping:false,maximumFractionDigits:20}" :readonly="readOnly" @update:model-value="typeof $event==='number' && Number.isFinite($event) && emit('change',$event)"><NumberFieldContent><NumberFieldDecrement :disabled="readOnly" :aria-label="`减少${label}`"/><NumberFieldInput :aria-label="label"/><NumberFieldIncrement :disabled="readOnly" :aria-label="`增加${label}`"/></NumberFieldContent></NumberField>
  <div v-else-if="Array.isArray(value)" class="cfd-value-list"><div v-for="(item,index) in value" :key="index" class="cfd-value-list-row"><PropertyValue :value="item" :label="`${label} ${index+1}`" :read-only="readOnly" :type="type?.replace('List','')" :objects="objects" :subelements="subelements" @change="updateIndex(index,$event)"/><Button v-if="!readOnly" variant="ghost" size="icon" :aria-label="`移除${label} ${index+1}`" @click="remove(index)"><X :size="13"/></Button></div><Button v-if="!readOnly" variant="outline" size="sm" :aria-label="`添加${label}`" @click="add"><Plus :size="13"/>添加</Button></div>
  <div v-else-if="object" class="cfd-object-value"><div v-for="(item,key) in object" :key="key" class="cfd-object-row"><label>{{ chinese(key) }}</label><PropertyValue :value="item" :label="`${label} ${chinese(key)}`" :read-only="readOnly" :objects="objects" :subelements="subelements" @change="updateKey(key,$event)"/><Button v-if="type?.includes('Map') && !readOnly" variant="ghost" size="icon" :aria-label="`移除${chinese(key)}`" @click="removeKey(key)"><X :size="13"/></Button></div><div v-if="type?.includes('Map') && !readOnly" class="cfd-object-row"><Input v-model="newKey" aria-label="新属性名称"/><Button variant="outline" size="sm" :disabled="!newKey || Object.hasOwn(object,newKey)" @click="addKey"><Plus :size="13"/>添加</Button></div></div>
  <Input v-else :model-value="String(value ?? '')" :readonly="readOnly" :aria-label="label" @change="emit('change',($event.target as HTMLInputElement).value)"/>
</template>
