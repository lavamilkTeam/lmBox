<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Play, Download, Square } from '@lucide/vue'
import { Button } from '../../../../ui/shadcn'
import { NozzleDesign } from '../features/nozzle'
import { InjectorDesign } from '../features/injector'
import { useDesignStore } from '../domain/design'
import { calculatePropulsion, saveTextFile } from '../../../../platform/desktop'
import type { DesignRequest } from '../../../../contracts'
import '../ui/workspace.css'
const props = defineProps<{ tool: 'nozzle' | 'injector' }>()
const store = useDesignStore()
const session = computed(() => props.tool === 'nozzle' ? store.nozzleSession : store.injectorSession)
const current = computed(() => session.value.result && session.value.submitted?.request.identity.inputRevision === session.value.revision && !session.value.pending && !session.value.error ? session.value.result : null)
const notice = ref('')
const saving = ref(false)
let controller: AbortController | undefined
function cancel(kind = props.tool) { controller?.abort(); controller = undefined; store.cancel(kind) }
watch(() => props.tool, (_, previous) => { cancel(previous); notice.value = '' })
watch(() => session.value.revision, () => { controller?.abort(); notice.value = '' }, { flush: 'sync' })
onBeforeUnmount(() => cancel())
async function calculate() {
  cancel(); notice.value = ''
  let request: DesignRequest
  try { request = store.begin(props.tool) }
  catch (error) { session.value.error = (error as Error).message; return }
  const task = new AbortController(); controller = task
  try { store.accept(request, await calculatePropulsion(request, task.signal)) }
  catch (error) { store.fail(request, error instanceof DOMException && error.name === 'AbortError' ? '' : (error as Error).message) }
  finally { if (controller === task) controller = undefined }
}
async function exportDrawing(file: { name: string; content: string; mime: string }) {
  if (!current.value || saving.value) return
  saving.value = true
  try { notice.value = await saveTextFile(file.name, file.content, file.mime) ? '图纸已导出。' : '已取消保存。' }
  catch (error) { notice.value = `导出失败：${(error as Error).message}` }
  finally { saving.value = false }
}
async function exportResult() {
  const result = current.value, request = session.value.submitted
  if (!result || !request || saving.value) return
  saving.value = true
  try {
    const saved = await saveTextFile(`${result.type}-result.json`, JSON.stringify({ request, result }, null, 2), 'application/json')
    notice.value = saved ? '结果已导出。' : '已取消保存。'
  } catch (error) { notice.value = `导出失败：${(error as Error).message}` }
  finally { saving.value = false }
}
</script>
<template>
  <div class="propulsion-workspace">
    <header class="design-header"><div><h1>{{ tool === 'nozzle' ? '喷管初步设计' : '喷注器水力设计' }}</h1><div v-if="tool === 'injector'" class="subtitle">INJECTOR HYDRAULIC DESIGN</div></div>
      <div class="design-actions"><Button variant="outline" size="sm" :disabled="!current || saving" @click="exportResult"><Download :size="14" />导出结果</Button>
        <Button v-if="session.pending" variant="outline" size="sm" @click="cancel()"><Square :size="12" />停止等待</Button>
        <Button size="sm" type="submit" :form="`${tool}-form`" :disabled="!!session.pending"><Play :size="13" />{{ session.pending ? '计算中…' : '开始计算' }}</Button>
      </div>
    </header>
    <NozzleDesign v-if="tool === 'nozzle'" :result="current?.type === 'nozzle' ? current.result : null" :notice="notice" @calculate="calculate" @export-drawing="exportDrawing" />
    <InjectorDesign v-else :result="current?.type === 'injector' ? current.result : null" :notice="notice" @calculate="calculate" />
    <footer class="design-status" role="status"><span>{{ session.pending ? '正在计算；停止等待将丢弃本次响应' : session.error ? '计算失败' : current ? '计算完成 · 结果对应当前输入' : session.result ? '参数已修改，请重新计算' : '尚未计算' }}</span><span>输入版本 {{ session.revision }} · {{ tool === 'nozzle' ? '长度显示 mm / 压力显示 MPa' : '尺寸显示 mm / 压降显示 MPa' }}</span></footer>
  </div>
</template>
