import { useProjectStore } from '../../../domain/project'
import { saveTextFile } from '../../../../../../platform/desktop'

export function useParameterExport(notify: (message: string) => void) {
  const store = useProjectStore()
  async function exportParams() {
    const doc = store.active
    if (!doc) return
    try {
      const data = { version: 2, source: doc.name, demo: doc.demo, parameters: doc.params, selectedLayer: doc.selectedLayer, design: doc.editing.design, edits: doc.editing.layers, outlineLayer: doc.editing.outlineLayer }
      const filename = `${doc.name.replace(/\.zip$/i, '')}.parameters.json`
      if (!await saveTextFile(filename, JSON.stringify(data, null, 2), 'application/json')) return
      store.log(doc, '参数配置已导出为 JSON。', 'success')
      notify('参数配置已导出')
    } catch (error) {
      notify(error instanceof Error ? error.message : '参数导出失败。')
    }
  }
  return { exportParams }
}
