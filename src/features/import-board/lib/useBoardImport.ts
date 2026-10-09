import { onBeforeUnmount, ref } from 'vue'
import { useProjectStore } from '../../../domain/project'
import { inspectFiles } from '../../../platform/desktop'

export function useBoardImport(notify: (message: string) => void) {
  const store = useProjectStore()
  const busy = ref(false)
  let controller: AbortController | undefined

  function cancelImport() { controller?.abort() }
  async function importFiles(files: File[]) {
    if (busy.value) return
    busy.value = true
    controller = new AbortController()
    try {
      const results = await inspectFiles(files, controller.signal)
      for (const result of results) store.add(result.name, result.layers)
      notify(`已读取 ${results.length} 个文件组，${results.flatMap(result => result.layers).filter(layer => layer.ir).length} 个图层已解析`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '文件读取失败'
      notify(message)
      if (store.active) store.log(store.active, message, 'warning')
    } finally {
      busy.value = false
      controller = undefined
    }
  }
  onBeforeUnmount(cancelImport)
  return { busy, importFiles, cancelImport }
}
