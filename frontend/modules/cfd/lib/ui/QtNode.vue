<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button, Checkbox, Input, Textarea, NumberField, NumberFieldContent, NumberFieldInput, NumberFieldIncrement, NumberFieldDecrement, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Tabs, TabsList, TabsTrigger, TabsContent, Progress, RadioGroup, RadioGroupItem, Table, TableBody, TableRow, TableCell, TableHeader, TableHead } from '../../../../ui/shadcn'
import { ChevronDown, ChevronRight } from '@lucide/vue'
import { chinese, fieldLabel } from './chinese'
import type { FieldPhase, UiNode, UiValue } from './types'
const props = defineProps<{ node: UiNode }>()
const emit = defineEmits<{ field: [id: string, value: UiValue, phase: FieldPhase]; click: [id: string] }>()
const draft = ref(String(props.node.value ?? ''))
const focused = ref(false)
watch(() => props.node.value, value => { if (!focused.value) draft.value = String(value ?? '') })
const label = computed(() => fieldLabel(props.node))
const placement = computed(() => {
  const p = props.node.placement
  return p ? { gridRow: `${p.row + 1} / span ${p.rowSpan ?? 1}`, gridColumn: `${p.column + 1} / span ${p.columnSpan ?? 1}` } : undefined
})
const columns = computed(() => ({ gridTemplateColumns: props.node.layout?.type === 'grid' || props.node.layout?.type === 'form' ? `repeat(${props.node.layout.columns ?? 2}, minmax(0,1fr))` : undefined }))
const selected = computed(() => Array.isArray(props.node.value) ? props.node.value : [])
const blocked = computed(() => !props.node.enabled || props.node.readOnly)
function field(value: UiValue, phase: FieldPhase = 'commit') { if(!props.node.enabled)return; emit('field', props.node.id, value, phase) }
function input(value: string | number) { if(blocked.value)return; draft.value = String(value); field(draft.value, 'input') }
function commit() { focused.value = false; if(blocked.value)return; field(draft.value, 'commit') }
function moveRadio(event: KeyboardEvent) {
  const parent = (event.target as HTMLElement).closest('.cfd-qt-layout')
  const radios = Array.from(parent?.querySelectorAll<HTMLButtonElement>(':scope > .cfd-node-radio [role="radio"]:not([disabled])') ?? [])
  const current = radios.indexOf(event.target as HTMLButtonElement)
  if (current < 0 || !radios.length) return
  const next = radios[(current + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + radios.length) % radios.length]
  next?.focus(); next?.click()
}
function selectIndex(index: number, event: MouseEvent) {
  const previous = selected.value.filter((v): v is number => typeof v === 'number')
  field(event.ctrlKey || event.metaKey || event.shiftKey ? previous.includes(index) ? previous.filter(v => v !== index) : [...previous, index] : [index])
}
function selectRow(id: string, event: MouseEvent) {
  const previous = selected.value.filter((v): v is string => typeof v === 'string')
  field(event.ctrlKey || event.metaKey || event.shiftKey ? previous.includes(id) ? previous.filter(v => v !== id) : [...previous, id] : [id])
}
function depth(parentId: string | null): number { let count = 0, current = parentId; const seen = new Set<string>(); while (current && !seen.has(current)) { seen.add(current); count++; current = props.node.rows?.find(row => row.id === current)?.parentId ?? null } return count }
function rowVisible(parentId: string | null): boolean { let current = parentId; const seen = new Set<string>(); while (current && !seen.has(current)) { seen.add(current); const parent = props.node.rows?.find(row => row.id === current); if (parent && !parent.expanded) return false; current = parent?.parentId ?? null } return true }
</script>
<template>
  <div v-if="node.visible" class="cfd-node" :class="`cfd-node-${node.kind}`" :data-qt-widget="node.name" :data-field-id="node.id" :style="placement" :title="chinese(node.tooltip)">
    <template v-if="node.kind === 'container'">
      <fieldset v-if="node.qtClass === 'QGroupBox'" class="cfd-fieldset" :disabled="!node.enabled"><legend v-if="node.label">{{ chinese(node.label) }}</legend><div class="cfd-qt-layout" :class="`cfd-layout-${node.layout?.type ?? 'vertical'}`" :style="columns"><QtNode v-for="child in node.children" :key="child.id" :node="child" @field="(id,value,phase) => emit('field',id,value,phase)" @click="emit('click',$event)"/></div></fieldset>
      <div v-else class="cfd-qt-layout" :class="`cfd-layout-${node.layout?.type ?? 'vertical'}`" :style="columns"><QtNode v-for="child in node.children" :key="child.id" :node="child" @field="(id,value,phase) => emit('field',id,value,phase)" @click="emit('click',$event)"/></div>
    </template>
    <p v-else-if="node.kind === 'label'" class="cfd-qt-label">{{ chinese(node.label ?? String(node.value ?? '')) }}</p>
    <Button v-else-if="node.kind === 'button'" variant="outline" size="sm" :disabled="blocked" @click="emit('click',node.id)">{{ label }}</Button>
    <label v-else-if="node.kind === 'checkbox'" class="cfd-check"><Checkbox :model-value="Boolean(node.value)" :disabled="blocked" :aria-label="label" @update:model-value="field($event === true)"/><span>{{ label }}</span></label>
    <RadioGroup v-else-if="node.kind === 'radio'" :model-value="node.value ? node.id : ''" :disabled="blocked" :aria-label="label" @update:model-value="emit('click',node.id)"><label class="cfd-check"><RadioGroupItem :value="node.id" :aria-label="label" @keydown.left.prevent="moveRadio" @keydown.right.prevent="moveRadio" @keydown.up.prevent="moveRadio" @keydown.down.prevent="moveRadio"/><span>{{ label }}</span></label></RadioGroup>
    <Select v-else-if="node.kind === 'select'" :model-value="String(node.value ?? -1)" :disabled="blocked" @update:model-value="field(Number($event))"><SelectTrigger :aria-label="label"><SelectValue/></SelectTrigger><SelectContent><SelectItem v-for="(option,index) in node.options" :key="index" :value="String(index)">{{ chinese(option) }}</SelectItem></SelectContent></Select>
    <NumberField v-else-if="node.kind === 'number'" :model-value="typeof node.value === 'number' ? node.value : undefined" :min="node.minimum" :max="node.maximum" :step="node.step" :step-snapping="false" :format-options="{useGrouping:false,maximumFractionDigits:20}" :disabled="!node.enabled" :readonly="node.readOnly" @update:model-value="typeof $event === 'number' && Number.isFinite($event) && field($event)"><NumberFieldContent><NumberFieldDecrement :aria-label="`减少${label}`"/><NumberFieldInput :aria-label="label"/><NumberFieldIncrement :aria-label="`增加${label}`"/></NumberFieldContent></NumberField>
    <div v-else-if="node.kind === 'quantity'" class="cfd-quantity"><Input :model-value="draft" :disabled="!node.enabled" :readonly="node.readOnly" :aria-label="label" @focus="focused=true" @update:model-value="input" @blur="commit" @keydown.enter="commit"/><span v-if="node.unit">{{ node.unit }}</span></div>
    <template v-else-if="node.kind === 'text'">
      <Textarea v-if="node.qtClass === 'QTextEdit' || node.qtClass === 'QTextBrowser' || node.qtClass === 'QPlainTextEdit'" :model-value="node.readOnly ? chinese(String(node.value ?? '')) : draft" :disabled="!node.enabled" :readonly="node.readOnly" :aria-label="label" @focus="focused=true" @update:model-value="input" @blur="commit"/>
      <Input v-else :model-value="draft" :disabled="!node.enabled" :readonly="node.readOnly" :aria-label="label" @focus="focused=true" @update:model-value="input" @blur="commit" @keydown.enter="commit"/>
    </template>
    <Tabs v-else-if="node.kind === 'tabs'" :model-value="String(node.value ?? 0)" @update:model-value="field(Number($event))"><TabsList :aria-label="label"><TabsTrigger v-for="(child,index) in node.children" :key="child.id" :value="String(index)" :disabled="!child.enabled">{{ chinese(child.label || child.name) }}</TabsTrigger></TabsList><TabsContent v-for="(child,index) in node.children" :key="child.id" :value="String(index)"><QtNode :node="child" @field="(id,value,phase) => emit('field',id,value,phase)" @click="emit('click',$event)"/></TabsContent></Tabs>
    <Progress v-else-if="node.kind === 'progress'" :model-value="node.maximum ? 100 * (Number(node.value ?? 0) - (node.minimum ?? 0)) / (node.maximum - (node.minimum ?? 0)) : null" :aria-label="label"/>
    <div v-else-if="node.kind === 'list'" role="listbox" :aria-label="label" aria-multiselectable="true" class="cfd-list">
      <div v-for="(option,index) in node.options" :key="index" class="cfd-list-row">
        <Checkbox v-if="node.items?.[index]?.checked !== undefined || node.items?.[index]?.checkState !== undefined" :model-value="node.items?.[index]?.checkState === 1 ? 'indeterminate' : node.items?.[index]?.checkState === 2 || node.items?.[index]?.checked === true" :aria-label="chinese(option)" :disabled="blocked" @update:model-value="field({index,checkState:$event === true ? 2 : 0})"/>
        <Button variant="ghost" size="sm" role="option" :aria-selected="selected.includes(index)" :disabled="blocked || node.items?.[index]?.enabled === false" @click="selectIndex(index,$event)">{{ chinese(option) }}</Button>
      </div>
    </div>
    <div v-else-if="node.kind === 'tree'" role="tree" :aria-label="label" aria-multiselectable="true" class="cfd-list">
      <template v-for="row in node.rows" :key="row.id"><div v-if="rowVisible(row.parentId)" class="cfd-list-row" :style="{paddingLeft:`${depth(row.parentId)*16}px`}">
        <Button v-if="node.rows?.some(child=>child.parentId===row.id)" variant="ghost" size="icon" :aria-label="`${row.expanded?'收起':'展开'}${chinese(row.label)}`" @click="field({id:row.id,expanded:!row.expanded})"><ChevronDown v-if="row.expanded" :size="13"/><ChevronRight v-else :size="13"/></Button>
        <Checkbox v-if="row.checkState !== undefined" :model-value="row.checkState === 1 ? 'indeterminate' : row.checkState === 2" :disabled="blocked" :aria-label="chinese(row.label)" @update:model-value="field({id:row.id,checkState:$event === true ? 2 : 0})"/>
        <Button variant="ghost" size="sm" role="treeitem" :aria-level="depth(row.parentId)+1" :aria-selected="row.selected" :disabled="blocked" @click="selectRow(row.id,$event)">{{ chinese(row.label) }}<span v-for="(column,index) in row.columns.slice(1)" :key="index">{{ chinese(column) }}</span></Button>
      </div></template>
    </div>
    <Table v-else-if="node.kind === 'table'" :aria-label="label"><TableHeader><TableRow><TableHead v-for="(header,index) in node.headers" :key="index">{{ chinese(header) }}</TableHead></TableRow></TableHeader><TableBody><TableRow v-for="(row,r) in node.cells" :key="r"><TableCell v-for="(cell,c) in row" :key="c"><span v-if="blocked" @click="field([{row:r,column:c}])">{{ chinese(cell) }}</span><Input v-else :model-value="cell" :aria-label="`${label} ${r+1} ${chinese(node.headers?.[c] || String(c+1))}`" @focus="field([{row:r,column:c}])" @change="field({row:r,column:c,text:($event.target as HTMLInputElement).value})"/></TableCell></TableRow></TableBody></Table>
    <div v-else role="alert" class="cfd-unsupported">{{ label }}：暂不支持此原生控件（{{ node.qtClass }}）</div>
  </div>
</template>
