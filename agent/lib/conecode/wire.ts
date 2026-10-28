// Adapted from ConeCode 2.4.8; see ../../third-party/conecode/NOTICE.
import { randomUUID } from 'node:crypto'
import type { AgentMessage, AgentTool, ToolCall } from '../types.js'
import { AgentError } from '../errors.js'

// OpenAIAdapter.cleanMessages preserves the model's original argument JSON.
export function cleanMessages(messages: AgentMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === 'tool') return { role: m.role, tool_call_id: m.tool_call_id, content: m.content }
    const out: Record<string, unknown> = { role: m.role, content: m.content }
    if (m.reasoning_content) out.reasoning_content = m.reasoning_content
    if (m.tool_calls?.length) {
      out.tool_calls = m.tool_calls.map((tc) => ({
        id: tc.id, type: 'function',
        function: { name: tc.name, arguments: tc.rawArguments },
      }))
      if (!out.content) out.content = null
    }
    return out
  })
}

export function toOpenAITools(tools: AgentTool[]): unknown[] {
  return tools.map((tl) => ({ type: 'function', function: { name: tl.name, description: tl.description, parameters: tl.parameters } }))
}

// Adapted from chat.store extractToolCalls. Invalid JSON is rejected rather than
// coerced to {}, because parameterless host tools must not accept malformed calls.
export function extractToolCalls(raw: unknown): ToolCall[] {
  if (!Array.isArray(raw)) throw new AgentError('provider_error', 'Invalid model tool calls.')
  if (raw.length > 8) throw new AgentError('tool_limit', 'A model step may request at most eight tools.')
  const ids = new Set<string>()
  return raw.map((tc) => {
    if (!tc || tc.type !== 'function' || typeof tc.function?.name !== 'string'
      || !tc.function.name || tc.function.name.length > 128 || typeof tc.function.arguments !== 'string') {
      throw new AgentError('provider_error', 'Invalid model tool call.')
    }
    let id = typeof tc.id === 'string' && tc.id.trim() ? tc.id.trim() : randomUUID()
    if (id.length > 128) throw new AgentError('provider_error', 'Invalid model tool identifier.')
    while (ids.has(id)) id = randomUUID()
    ids.add(id)
    let args: unknown
    try { args = JSON.parse(tc.function.arguments) } catch { throw new AgentError('invalid_tool_input', 'Invalid tool argument JSON.') }
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new AgentError('invalid_tool_input', 'Tool arguments must be an object.')
    return { id, name: tc.function.name, arguments: args as Record<string, unknown>, rawArguments: tc.function.arguments }
  })
}

// ConeCode OpenAIAdapter streaming accumulator: each index owns its fragments.
export class CompletionAccumulator {
  content = ''
  reasoning = ''
  finishReason = ''
  sawDone = false
  private calls = new Map<number, { id: string; name: string; args: string }>()
  addLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const data = trimmed.replace(/^data:\s*/, '')
    if (data === '[DONE]') { this.sawDone = true; return }
    let parsed: any
    try { parsed = JSON.parse(data) } catch { throw new AgentError('provider_error', 'Invalid model stream.') }
    const choice = parsed.choices?.[0]
    if (choice?.finish_reason) this.finishReason = choice.finish_reason
    const delta = choice?.delta
    if (delta?.refusal) throw new AgentError('provider_refusal', 'Agent provider declined the request.')
    const reasoning = delta?.reasoning_content ?? delta?.reasoning ?? ''
    const content = delta?.content ?? ''
    if (typeof reasoning !== 'string' || typeof content !== 'string') throw new AgentError('provider_error', 'Invalid model stream content.')
    this.reasoning += reasoning
    this.content += content
    if (delta?.tool_calls !== undefined && !Array.isArray(delta.tool_calls)) throw new AgentError('provider_error', 'Invalid model stream tools.')
    for (const tc of delta?.tool_calls ?? []) {
      const idx = typeof tc.index === 'number' ? tc.index : this.calls.size ? this.calls.size - 1 : 0
      if (!Number.isSafeInteger(idx) || idx < 0 || idx >= 8) throw new AgentError('tool_limit', 'A model step may request at most eight tools.')
      const cur = this.calls.get(idx) ?? { id: '', name: '', args: '' }
      if (tc.id) cur.id = tc.id
      if (tc.function?.name) cur.name += tc.function.name
      if (tc.function?.arguments) cur.args += tc.function.arguments
      this.calls.set(idx, cur)
    }
  }
  finish() {
    if (!this.sawDone && !this.finishReason) throw new AgentError('incomplete_response', 'Agent provider stream ended before completion.')
    if (this.finishReason === 'length' || this.finishReason === 'content_filter') throw new AgentError('incomplete_response', 'Agent provider did not complete its response.')
    const raw = [...this.calls.entries()].sort((a, b) => a[0] - b[0]).map(([idx, tc]) => ({
      id: tc.id || `call_${idx}_${Date.now()}`, type: 'function', function: { name: tc.name, arguments: tc.args || '{}' },
    }))
    const calls = extractToolCalls(raw)
    if (!calls.length && !this.content.trim()) throw new AgentError('provider_error', 'Agent provider returned an empty response.')
    return { content: this.content, reasoning: this.reasoning, calls }
  }
}
