import { computed, ref } from 'vue'

interface WorkspaceTool { id: string; label: string; available: boolean }
interface WorkspaceTab { id: string; label: string; fixed?: boolean }
interface CloseConfirmation { id: string; label: string; pending: boolean; error: string }
interface WorkspaceTabsOptions {
  tools: readonly WorkspaceTool[]
  closeHandlers?: Readonly<Record<string, () => Promise<void>>>
}

export function useWorkspaceTabs({ tools, closeHandlers = {} }: WorkspaceTabsOptions) {
  const active = ref('guide')
  const opened = ref<string[]>([])
  const closeConfirmation = ref<CloseConfirmation>()
  const fixedTabs: WorkspaceTab[] = [
    { id: 'guide', label: '开始', fixed: true },
    { id: 'library', label: '功能库', fixed: true },
  ]
  const tabs = computed<WorkspaceTab[]>(() => [
    ...fixedTabs,
    ...opened.value.map(id => ({ id, label: tools.find(tool => tool.id === id)!.label })),
  ])

  function selectTab(id: string) {
    if (tabs.value.some(tab => tab.id === id)) active.value = id
  }

  function openTool(id: string) {
    if (!tools.some(tool => tool.id === id && tool.available)) return
    if (!opened.value.includes(id)) opened.value.push(id)
    active.value = id
  }

  function removeTab(id: string) {
    const index = opened.value.indexOf(id)
    if (index < 0) return
    opened.value.splice(index, 1)
    if (active.value === id) active.value = opened.value[index] ?? opened.value[index - 1] ?? 'guide'
  }

  function closeTab(id: string) {
    if (!opened.value.includes(id)) return
    if (!closeHandlers[id]) { removeTab(id); return }
    if (closeConfirmation.value?.pending) return
    closeConfirmation.value = { id, label: tools.find(tool => tool.id === id)!.label, pending: false, error: '' }
  }

  function cancelClose() {
    if (!closeConfirmation.value?.pending) closeConfirmation.value = undefined
  }

  async function confirmClose() {
    const confirmation = closeConfirmation.value
    if (!confirmation || confirmation.pending) return
    confirmation.pending = true
    confirmation.error = ''
    try {
      await closeHandlers[confirmation.id]!()
      removeTab(confirmation.id)
      closeConfirmation.value = undefined
    } catch (error) {
      confirmation.error = error instanceof Error ? error.message : String(error)
    } finally {
      confirmation.pending = false
    }
  }

  return {
    active: computed(() => active.value),
    tabs,
    closeConfirmation: computed(() => closeConfirmation.value),
    selectTab, openTool, closeTab, cancelClose, confirmClose,
  }
}
