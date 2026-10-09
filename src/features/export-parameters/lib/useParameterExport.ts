import { useProjectStore } from '../../../domain/project'
import { saveParameters } from '../../../platform/desktop'

export function useParameterExport(notify: (message: string) => void) {
  const store = useProjectStore()
  async function exportParams() {
    const doc = store.active
    if (!doc) return
    try {
      if (!await saveParameters(doc)) return
      store.log(doc, '参数配置已导出为 JSON。', 'success')
      notify('参数配置已导出')
    } catch (error) {
      notify(error instanceof Error ? error.message : '参数导出失败。')
    }
  }
  return { exportParams }
}
