import { readonly, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

type AccountStatus = 'unknown' | 'guest' | 'authenticated'
type ExperienceMode = 'agent' | 'advanced'

export function useExperienceMode(accountStatus: MaybeRefOrGetter<AccountStatus>) {
  const mode = ref<ExperienceMode>('advanced')
  const open = ref(false)
  let prompted = false
  watch(() => toValue(accountStatus), status => {
    if (status === 'authenticated') {
      open.value = false
      prompted = false
    } else if (status === 'guest' && !prompted) {
      prompted = true
      open.value = true
    }
  }, { immediate: true, flush: 'sync' })
  function setOpen(value: boolean) { open.value = value }
  function select(value: ExperienceMode) {
    mode.value = value
    open.value = false
  }
  return { mode: readonly(mode), open: readonly(open), setOpen, select }
}
