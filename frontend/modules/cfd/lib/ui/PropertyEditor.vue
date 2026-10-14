<script setup lang="ts">
import { computed } from 'vue'
import PropertyValue from './PropertyValue.vue'
import type { UiProperty, UiValue } from './types'
import { chinese } from './chinese'
const props=defineProps<{properties:UiProperty[];objects:{id:string;label:string}[];subelements:Record<string,string[]>}>()
defineEmits<{change:[name:string,value:UiValue]}>()
const groups=computed(()=>[...new Set(props.properties.map(p=>p.group))])
</script>
<template><div class="cfd-properties"><section v-for="group in groups" :key="group"><h3>{{ chinese(group) || '基本' }}</h3><div v-for="property in properties.filter(p=>p.group===group)" :key="property.name" class="cfd-property" :data-property="property.name"><label>{{ chinese(property.name) }}</label><PropertyValue :value="property.value" :label="chinese(property.name)" :type="property.type" :read-only="property.readOnly" :options="property.options" :objects="objects" :subelements="subelements" @change="$emit('change',property.name,$event)"/></div></section></div></template>
