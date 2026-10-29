import { computed, readonly, ref } from 'vue'
import { defineStore, getActivePinia } from 'pinia'
import { useAgentSession } from '../../../domain/session'

export const useChatHistory = defineStore('agent-chat-history', () => {
  const pinia = getActivePinia()!
  const ids = ref<string[]>([]), activeId = ref(''), query = ref('')
  const session = computed(() => activeId.value ? useAgentSession(activeId.value, pinia) : undefined)
  const items = computed(() => ids.value.map(id => {
    const chat = useAgentSession(id, pinia)
    const text = chat.turns[0]?.prompt.trim() || chat.prompt.trim() || '新聊天'
    const title = [...text.replace(/\s+/g, ' ')].slice(0, 40).join('')
    const status = chat.pending ? '启动中' : chat.unconfirmed ? '状态待确认' : chat.job?.status === 'running' ? '执行中' : ''
    return { id, title, status }
  }).filter(item => item.title.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())))

  function create(id: string) {
    if (!id || ids.value.includes(id) || session.value?.locked) return false
    const current = session.value
    if (current && !current.turns.length && !current.prompt.trim() && !current.files.length) {
      query.value = ''
      return false
    }
    const chat = useAgentSession(id, pinia)
    chat.initialize(id, id)
    ids.value.unshift(id)
    activeId.value = id
    query.value = ''
    return true
  }
  function initialize(id: string) { if (!activeId.value) create(id) }
  function select(id: string) {
    if (!ids.value.includes(id) || session.value?.locked || id === activeId.value) return false
    activeId.value = id
    return true
  }
  function setQuery(value: string) { query.value = value }
  return { activeId: readonly(activeId), query: readonly(query), session, items, create, initialize, select, setQuery }
})
