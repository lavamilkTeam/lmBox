<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FolderOpen, Settings2 } from '@lucide/vue'
import { Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Input, Label, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '../../../../ui/shadcn'
import WorkflowCanvas from './WorkflowCanvas.vue'
import type { CatalogEntry, VideoArtifact, VideoField, VideoNode } from './types'
const props = defineProps<{
  nodes: VideoNode[]; catalog: CatalogEntry[]; configured: boolean; inspecting: boolean; locked: boolean; pending: boolean; unconfirmed: boolean
  status: string; error: string; connectionError: string; events: string[]; artifacts: VideoArtifact[]; artifactBusy: boolean
}>()
const emit = defineEmits<{
  inspect: []; add: [type: string, x: number, y: number]; move: [id: string, x: number, y: number]; remove: [id: string]
  connect: [source: string, output: number, target: string, input: string]; input: [id: string, name: string, value: unknown]
  import: [file: File]; export: [api: boolean]; run: []; recover: []; cancel: []; preview: [id: string]; download: [id: string]
}>()
const search = ref(''), selected = ref(''), canvas = ref<InstanceType<typeof WorkflowCanvas>>(), file = ref<HTMLInputElement>()
const visibleCatalog = computed(() => {
  const query = search.value.toLocaleLowerCase()
  return props.catalog.filter(item => `${item.title} ${item.type} ${item.category}`.toLocaleLowerCase().includes(query))
})
const active = computed(() => props.nodes.find(node => node.id === selected.value))
const taskStatus = computed(() => ['就绪', '连接中', '未连接'].includes(props.status) ? '' : props.status)
watch(() => props.nodes.map(node => node.id).join(','), () => { if (!active.value) selected.value = props.nodes[0]?.id ?? '' })
function add(type: string) { const point = canvas.value?.insertionPoint() ?? { x: 40, y: 40 }; emit('add', type, point.x, point.y) }
function importFile(event: Event) { const input = event.target as HTMLInputElement; const selectedFile = input.files?.[0]; if (selectedFile) emit('import', selectedFile); input.value = '' }
function valueChanged(field: VideoField, value: string | number) {
  if (!active.value) return
  emit('input', active.value.id, field.name, field.type === 'INT' || field.type === 'FLOAT' ? (value === '' ? undefined : Number(value)) : String(value))
}
function choiceChanged(field: VideoField, value: unknown) { if (active.value && typeof value === 'string') emit('input', active.value.id, field.name, JSON.parse(value)) }
function showValue(value: unknown): string | number { return typeof value === 'string' || typeof value === 'number' ? value : value === undefined ? '' : JSON.stringify(value) }
</script>
<template>
  <main class="video-workspace" aria-label="ComfyUI">
    <div class="video-body">
      <aside class="video-library" aria-label="视频节点库">
        <div class="video-panel-heading">
          <strong>节点库</strong>
          <div class="video-library-actions">
            <DropdownMenu>
              <DropdownMenuTrigger as-child><Button variant="ghost" size="icon-sm" aria-label="工作流文件" title="工作流文件"><FolderOpen aria-hidden="true" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem :disabled="locked" @select="file?.click()">导入工作流</DropdownMenuItem>
                <DropdownMenuItem :disabled="!nodes.length" @select="emit('export', false)">保存工作流</DropdownMenuItem>
                <DropdownMenuItem :disabled="!nodes.length" @select="emit('export', true)">导出 API</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Popover>
              <PopoverTrigger as-child><Button variant="ghost" size="icon-sm" aria-label="视频连接设置" title="连接设置"><Settings2 aria-hidden="true" /></Button></PopoverTrigger>
              <PopoverContent class="video-connection-panel" align="start" aria-label="视频连接设置">
                <div class="video-panel-heading"><strong>ComfyUI</strong><span role="status">{{ inspecting ? '连接中' : configured ? '已连接' : '未连接' }}</span></div>
                <p v-if="connectionError" class="video-connection-error" role="alert">{{ connectionError }}</p>
                <Button variant="outline" size="sm" :disabled="inspecting" @click="emit('inspect')">刷新连接</Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <input ref="file" type="file" accept=".json,application/json" hidden aria-label="选择ComfyUI文件" @change="importFile">
        <Input v-model="search" aria-label="搜索视频节点" placeholder="搜索节点" />
        <div class="video-catalog">
          <Button v-for="entry in visibleCatalog" :key="entry.type" variant="ghost" class="video-catalog-item" :disabled="locked" :title="`${entry.category} / ${entry.type}`" @click="add(entry.type)">{{ entry.title }}</Button>
          <span v-if="configured && !visibleCatalog.length" role="status">没有匹配节点</span>
        </div>
      </aside>
      <WorkflowCanvas ref="canvas" :nodes="nodes" :selected="selected" :locked="locked" @select="selected = $event" @move="(id, x, y) => emit('move', id, x, y)" @remove="emit('remove', $event)" @connect="(source, output, target, input) => emit('connect', source, output, target, input)" @disconnect="(id, name) => emit('input', id, name, undefined)">
        <div class="video-run-panel">
          <div v-if="error" class="video-operation-error" role="alert">{{ error }}</div>
          <div class="video-run-actions">
            <span v-if="taskStatus" class="video-task-status" role="status">{{ taskStatus }}</span>
            <Button v-if="unconfirmed" variant="outline" size="sm" @click="emit('recover')">确认任务状态</Button>
            <Button v-else-if="locked" variant="outline" size="sm" :disabled="pending" @click="emit('cancel')">取消任务</Button>
            <Button v-else size="sm" :disabled="!configured || !nodes.length" @click="emit('run')">生成视频</Button>
          </div>
        </div>
      </WorkflowCanvas>
      <aside class="video-properties" aria-label="视频节点参数">
        <template v-if="active">
          <div class="video-panel-heading"><strong>{{ active.title }}</strong><Badge variant="outline">{{ active.id }}</Badge></div>
          <div v-for="field in active.inputs" :key="`${active.id}:${field.name}`" class="video-field">
            <Label :for="`video-input-${active.id}-${field.name}`">{{ field.name }}<span v-if="field.required"> *</span></Label>
            <span v-if="field.secret" class="video-field-state">凭据由后端配置</span>
            <div v-else-if="field.connection" class="video-link-value"><span>{{ field.connection.nodeId }} : {{ field.connection.outputIndex }}</span><Button variant="outline" size="sm" :disabled="locked" @click="emit('input', active.id, field.name, undefined)">断开</Button></div>
            <Select v-else-if="field.choices || field.type === 'BOOLEAN'" :model-value="field.value === undefined ? undefined : JSON.stringify(field.value)" :disabled="locked" @update:model-value="choiceChanged(field, $event)">
              <SelectTrigger :id="`video-input-${active.id}-${field.name}`" :aria-label="field.name"><SelectValue placeholder="选择" /></SelectTrigger>
              <SelectContent><SelectItem v-for="choice in field.choices ?? [true, false]" :key="JSON.stringify(choice)" :value="JSON.stringify(choice)">{{ typeof choice === 'boolean' ? (choice ? '是' : '否') : choice }}</SelectItem></SelectContent>
            </Select>
            <Textarea v-else-if="field.type === 'STRING'" :id="`video-input-${active.id}-${field.name}`" :model-value="showValue(field.value)" :disabled="locked" :aria-label="field.name" @update:model-value="valueChanged(field, $event)" />
            <Input v-else-if="field.type === 'INT' || field.type === 'FLOAT'" :id="`video-input-${active.id}-${field.name}`" type="number" :step="field.type === 'INT' ? 1 : 'any'" :min="field.min" :max="field.max" :model-value="showValue(field.value)" :disabled="locked" :aria-label="field.name" @update:model-value="valueChanged(field, $event)" />
            <template v-else-if="field.type === 'UNKNOWN'"><span class="video-field-state">节点目录中不存在此输入</span><Textarea :id="`video-input-${active.id}-${field.name}`" :model-value="showValue(field.value)" readonly :aria-label="field.name" /></template>
            <Textarea v-else-if="field.type === 'DYNAMIC'" :id="`video-input-${active.id}-${field.name}`" :model-value="showValue(field.value)" readonly :aria-label="field.name" />
            <span v-else class="video-field-state">{{ field.type }} · 未连接</span>
            <Button v-if="!field.required && field.value !== undefined && !field.connection && !field.secret" variant="ghost" size="sm" :disabled="locked" @click="emit('input', active.id, field.name, undefined)">清除输入</Button>
          </div>
        </template>
        <section v-if="artifacts.length" class="video-results" aria-label="视频生成结果">
          <strong>生成结果</strong>
          <article v-for="artifact in artifacts" :key="artifact.id" class="video-artifact">
            <span>{{ artifact.name }}</span>
            <video v-if="artifact.url && artifact.mimeType.startsWith('video/')" :src="artifact.url" controls preload="metadata" />
            <img v-else-if="artifact.url && artifact.mimeType.startsWith('image/')" :src="artifact.url" :alt="artifact.name">
            <audio v-else-if="artifact.url && artifact.mimeType.startsWith('audio/')" :src="artifact.url" controls preload="metadata" />
            <div class="video-artifact-actions"><Button v-if="/^(video|image|audio)\//.test(artifact.mimeType)" variant="outline" size="sm" :disabled="artifactBusy" @click="emit('preview', artifact.id)">预览</Button><Button variant="outline" size="sm" :disabled="artifactBusy" @click="emit('download', artifact.id)">下载</Button></div>
          </article>
        </section>
      </aside>
    </div>
    <section v-if="events.length" class="video-events" aria-label="视频任务日志" aria-live="polite"><div v-for="(event, index) in events" :key="index">{{ event }}</div></section>
  </main>
</template>
