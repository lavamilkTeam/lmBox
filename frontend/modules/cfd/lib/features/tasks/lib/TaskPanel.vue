<script setup lang="ts">
import type { CfdState, CfdValue } from '../../../../../../contracts'
import { Button, ScrollArea } from '../../../../../../ui/shadcn'
import { QtNode, chinese } from '../../../ui'
const props=defineProps<{editor:NonNullable<CfdState['editor']>}>()
const emit=defineEmits<{field:[fieldId:string,value:CfdValue,phase:'input'|'commit'];click:[fieldId:string];accept:[];reject:[]}>()
</script>
<template><section class="cfd-task"><header><h2>{{ chinese(props.editor.title) }}</h2><div class="cfd-task-actions"><Button v-if="editor.actions.accept" size="sm" @click="emit('accept')">{{ chinese(editor.actions.acceptLabel || 'OK') }}</Button><Button v-if="editor.actions.reject" variant="outline" size="sm" @click="emit('reject')">{{ chinese(editor.actions.rejectLabel || 'Cancel') }}</Button></div></header><ScrollArea class="cfd-task-scroll"><QtNode v-for="root in editor.roots" :key="root.id" :node="root" @field="(id,value,phase)=>emit('field',id,value,phase)" @click="emit('click',$event)"/></ScrollArea></section></template>
