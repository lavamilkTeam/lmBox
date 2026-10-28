import { readonly, ref } from 'vue'

export function useHelpDialog() {
  const activeId = ref<string | null>(null)
  function setOpen(id: string, open: boolean) {
    if (open) activeId.value = id
    else if (activeId.value === id) activeId.value = null
  }
  return { activeId: readonly(activeId), setOpen }
}
