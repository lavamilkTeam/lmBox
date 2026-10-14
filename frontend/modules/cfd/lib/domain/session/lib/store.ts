import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { CfdRequest, CfdResponse, CfdState } from '../../../../../../contracts'

/** The worker owns document facts; this store only accepts matching session snapshots. */
export const useCfdSession = defineStore('cfd-session', () => {
  const projectId = ref('')
  const revision = ref(0)
  const state = shallowRef<CfdState | null>(null)
  const error = ref('')
  const errorCode = ref('')
  const pending = ref<string | null>(null)
  function initialize(id: string) { if (!projectId.value) projectId.value = id }
  function begin(request: CfdRequest) {
    if (request.projectId !== projectId.value || request.expectedRevision !== revision.value) throw new Error('CFD 请求版本已失效。')
    pending.value = request.requestId
  }
  function dismiss(request: CfdRequest) { if (pending.value === request.requestId) pending.value = null }
  function fail(request: CfdRequest, message: string) { if (pending.value === request.requestId) { pending.value = null; error.value = message; errorCode.value = 'transport_error' } }
  function accept(request: CfdRequest, response: CfdResponse): boolean {
    if (request.projectId !== projectId.value || response.projectId !== projectId.value || response.requestId !== request.requestId || response.inputRevision !== request.expectedRevision || response.schemaVersion !== 1) {
      throw new Error('CFD 响应与当前工程或请求不匹配。')
    }
    if (pending.value !== request.requestId || request.expectedRevision !== revision.value || response.revision < revision.value) return false
    pending.value = null
    revision.value = response.revision
    const previousAction = state.value?.lastAction?.requestId
    const action = response.state?.lastAction
    if (response.state) state.value = response.state
    if (!response.ok) { error.value = response.error?.message ?? 'CFD 操作失败。'; errorCode.value = response.error?.code ?? 'request_failed' }
    else if (action?.ok === false) { error.value = action.error ?? 'CFD 操作失败。'; errorCode.value = 'native_action_failed' }
    else if (!['poll', 'inspect'].includes(request.operation) || action?.requestId !== previousAction) { error.value = ''; errorCode.value = '' }
    return true
  }
  function resetAfterClose() { revision.value = 0; state.value = null; pending.value = null; error.value = ''; errorCode.value = '' }
  return { projectId, revision, state, error, errorCode, pending, initialize, begin, dismiss, fail, accept, resetAfterClose }
})
