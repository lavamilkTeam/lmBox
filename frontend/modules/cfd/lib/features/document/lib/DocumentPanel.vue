<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CfdState, CfdValue } from '../../../../../../contracts'
import { Button, ScrollArea, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../../../../../../ui/shadcn'
import { ChevronDown, ChevronRight, Box, Folder, Eye, EyeOff, MoreHorizontal, Pencil, Trash2 } from '@lucide/vue'
import { PropertyEditor, chinese } from '../../../ui'
const props=defineProps<{document:CfdState['document'];selection:CfdState['selection'];geometry:CfdState['geometry']}>()
const emit=defineEmits<{select:[id:string,append:boolean];edit:[id:string];visibility:[id:string,visible:boolean];delete:[id:string];property:[id:string,name:string,value:CfdValue]}>()
const collapsed=ref(new Set<string>())
const selectedId=computed(()=>props.selection.at(-1)?.objectId)
const selectedObject=computed(()=>props.document.objects.find(object=>object.id===selectedId.value))
const children=(id:string)=>props.document.objects.filter(o=>o.parentId===id)
function depth(id:string) {let current=props.document.objects.find(o=>o.id===id)?.parentId,n=0;const seen=new Set<string>();while(current&&!seen.has(current)){seen.add(current);n++;current=props.document.objects.find(o=>o.id===current)?.parentId}return n}
function visible(id:string) {let current=props.document.objects.find(o=>o.id===id)?.parentId;const seen=new Set<string>();while(current&&!seen.has(current)){seen.add(current);if(collapsed.value.has(current))return false;current=props.document.objects.find(o=>o.id===current)?.parentId}return true}
function toggle(id:string) {const next=new Set(collapsed.value);next.has(id)?next.delete(id):next.add(id);collapsed.value=next}
const subelements=computed(()=>Object.fromEntries(props.geometry.map(g=>[g.objectId,[...g.faces.map(f=>f.id),...(g.edges??[]).map(e=>e.id),...(g.points??[]).map(p=>p.id),...(g.solids??[]).map(s=>s.id)]])))
</script>
<template><div class="cfd-document"><ScrollArea class="cfd-model-tree"><div role="tree" aria-label="模型树" aria-multiselectable="true"><div class="cfd-document-title"><Folder :size="15"/>{{ chinese(document.label || document.name) }}</div><template v-for="object in document.objects" :key="object.id"><div v-if="visible(object.id)" class="cfd-object-tree-row" :style="{paddingLeft:`${depth(object.id)*16}px`}" :data-object-id="object.id">
  <Button v-if="children(object.id).length" variant="ghost" size="icon" :aria-label="`${collapsed.has(object.id)?'展开':'收起'}${chinese(object.label)}`" @click="toggle(object.id)"><ChevronRight v-if="collapsed.has(object.id)" :size="13"/><ChevronDown v-else :size="13"/></Button><span v-else class="cfd-tree-spacer"/>
  <Button variant="ghost" size="sm" role="treeitem" :aria-level="depth(object.id)+1" :aria-selected="selection.some(s=>s.objectId===object.id)" :aria-expanded="children(object.id).length?!collapsed.has(object.id):undefined" @click="emit('select',object.id,$event.ctrlKey||$event.metaKey||$event.shiftKey)" @dblclick="emit('edit',object.id)" @keydown.enter="emit('edit',object.id)" @keydown.space.prevent="emit('visibility',object.id,!object.visible)"><Box :size="14"/>{{ chinese(object.label) }}</Button>
  <DropdownMenu><DropdownMenuTrigger as-child><Button variant="ghost" size="icon" :aria-label="`${chinese(object.label)}操作`"><MoreHorizontal :size="14"/></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem @select="emit('edit',object.id)"><Pencil :size="14"/>编辑</DropdownMenuItem><DropdownMenuItem @select="emit('visibility',object.id,!object.visible)"><EyeOff v-if="object.visible" :size="14"/><Eye v-else :size="14"/>{{ object.visible?'隐藏':'显示' }}</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem variant="destructive" @select="emit('delete',object.id)"><Trash2 :size="14"/>删除</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
</div></template></div></ScrollArea><ScrollArea class="cfd-property-scroll"><PropertyEditor v-if="selectedObject" :properties="selectedObject.properties" :objects="document.objects" :subelements="subelements" @change="(name,value)=>emit('property',selectedObject!.id,name,value)"/></ScrollArea></div></template>
