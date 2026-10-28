import { AgentError, checkCancelled } from './errors.js'
import { cleanMessages, CompletionAccumulator, extractToolCalls, toOpenAITools } from './conecode/wire.js'
import type { AgentMessage, AgentProvider, AgentTool, AgentTurn } from './types.js'

const LIMIT = 2 * 1024 * 1024
type Environment = Record<string, string | undefined>

export function createOpenAIProvider(env: Environment = process.env): AgentProvider {
  const base = (env.LMBOX_AGENT_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const model = env.LMBOX_AGENT_MODEL?.trim() || ''
  const key = env.LMBOX_AGENT_API_KEY || ''
  const timeoutMs = Number(env.LMBOX_AGENT_TIMEOUT_MS || 200000)
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000) throw new AgentError('invalid_configuration', 'Agent timeout must be between 1000 and 600000 ms.')
  const reasoningEffort = env.LMBOX_AGENT_REASONING_EFFORT?.trim()
  if (reasoningEffort && !['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(reasoningEffort)) throw new AgentError('invalid_configuration', 'Invalid reasoning effort.')
  let url: URL
  try { url = new URL(base) } catch { throw new AgentError('invalid_configuration', 'Invalid agent provider URL.') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new AgentError('invalid_configuration', 'Invalid agent provider URL.')
  }
  if (!model) throw new AgentError('model_not_configured', 'Configure an agent model in the host environment.')
  if (url.hostname === 'api.openai.com' && !key) throw new AgentError('missing_credentials', 'The configured agent provider requires an API key.')

  async function request<T>(path: string, body: unknown, signal: AbortSignal, consume: (response: Response, signal: AbortSignal) => Promise<T>): Promise<T> {
    checkCancelled(signal)
    const controller = new AbortController()
    const cancel = () => controller.abort()
    signal.addEventListener('abort', cancel, { once: true })
    const timeout = setTimeout(cancel, timeoutMs)
    try {
      const encoded = body === undefined ? undefined : JSON.stringify(body)
      if (encoded && Buffer.byteLength(encoded) > LIMIT) throw new AgentError('context_limit', 'Agent context exceeds the 2 MiB limit.')
      const response = await fetch(`${base}${path}`, {
        method: encoded ? 'POST' : 'GET', redirect: 'error', signal: controller.signal,
        headers: { Accept: 'application/json, text/event-stream', ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(encoded ? { 'Content-Type': 'application/json' } : {}) },
        body: encoded,
      })
      if (!response.ok) {
        await response.body?.cancel()
        if ([401, 403].includes(response.status)) throw new AgentError('provider_auth', 'Agent provider rejected the configured credentials.')
        if (response.status === 429) throw new AgentError('provider_rate_limit', 'Agent provider rate or quota limit reached.')
        throw new AgentError('provider_error', `Agent provider returned HTTP ${response.status}.`)
      }
      return await consume(response, controller.signal)
    } catch (error) {
      checkCancelled(signal)
      if (controller.signal.aborted) throw new AgentError('provider_timeout', 'Agent provider request timed out.')
      if (error instanceof AgentError) throw error
      throw new AgentError('provider_unavailable', 'Cannot complete the configured agent provider request.')
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', cancel)
    }
  }

  async function readBody(response: Response, signal: AbortSignal, chunk: (text: string) => void): Promise<void> {
    const reader = response.body?.getReader()
    if (!reader) throw new AgentError('provider_error', 'Agent provider returned an empty body.')
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let bytes = 0
    try {
      while (true) {
        checkCancelled(signal)
        const result = await reader.read()
        if (result.done) break
        bytes += result.value.byteLength
        if (bytes > LIMIT) throw new AgentError('provider_limit', 'Agent provider response exceeds the size limit.')
        chunk(decoder.decode(result.value, { stream: true }))
      }
      chunk(decoder.decode())
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  }

  async function readJSON(response: Response, signal: AbortSignal): Promise<any> {
    let text = ''
    await readBody(response, signal, (part) => { text += part })
    try {
      const value = JSON.parse(text)
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
      return value
    } catch { throw new AgentError('provider_error', 'Agent provider returned invalid JSON.') }
  }

  return {
    model,
    async inspect(signal) {
      await request('/models', undefined, signal, async (response, requestSignal) => {
        const value = await readJSON(response, requestSignal)
        if (!Array.isArray(value.data) || !value.data.some((entry: any) => entry?.id === model)) {
          throw new AgentError('model_unavailable', 'The configured agent model is not available.')
        }
      })
    },
    async complete(messages: AgentMessage[], tools: AgentTool[], signal: AbortSignal): Promise<AgentTurn> {
      return request('/chat/completions', {
        model, messages: cleanMessages(messages), tools: toOpenAITools(tools), tool_choice: 'auto', stream: true, stream_options: { include_usage: true },
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      }, signal, async (response, requestSignal) => {
        if (response.headers.get('content-type')?.includes('text/event-stream')) {
          const accumulator = new CompletionAccumulator()
          let pending = ''
          await readBody(response, requestSignal, (part) => {
            pending += part
            const lines = pending.split('\n')
            pending = lines.pop() || ''
            for (const line of lines) accumulator.addLine(line)
          })
          if (pending.trim()) accumulator.addLine(pending)
          return accumulator.finish()
        }
        const raw = await readJSON(response, requestSignal)
        const choice = raw.choices?.[0]
        const message = choice?.message
        if (['length', 'content_filter'].includes(choice?.finish_reason)) throw new AgentError('incomplete_response', 'Agent provider did not complete its response.')
        if (message?.refusal) throw new AgentError('provider_refusal', 'Agent provider declined the request.')
        if (!message || (message.content !== null && message.content !== undefined && typeof message.content !== 'string')) throw new AgentError('provider_error', 'Invalid model response.')
        const calls = extractToolCalls(message.tool_calls ?? [])
        const content = message.content ?? ''
        if (!content.trim() && !calls.length) throw new AgentError('provider_error', 'Agent provider returned an empty response.')
        return { content, calls, reasoning: typeof message.reasoning_content === 'string' ? message.reasoning_content : undefined }
      })
    },
  }
}
