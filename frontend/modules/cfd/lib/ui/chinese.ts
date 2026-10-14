import catalog from './zh-CN.json'
import fieldLabels from './field-labels.json'
import type { UiNode } from './types'

const entries = catalog as Record<string, string>
const normalize = (value: string) => value.replace(/&(?!\w+;)/g, '').replace(/\s+/g, ' ').trim()
const normalized = new Map(Object.entries(entries).map(([key, value]) => [normalize(key), value]))
/** Translate presentation only; callers always retain native values and identifiers. */
export function chinese(source: string | undefined | null): string {
  if (!source) return ''
  const translated = entries[source] ?? normalized.get(normalize(source))
  if (translated !== undefined) return plainText(translated).replace(/&(?!\w+;)/g, '')
  const indexed = source.match(/^(.*?)(\d+)$/)
  if (indexed && (entries[indexed[1]!] || normalized.has(normalize(indexed[1]!)))) return `${chinese(indexed[1])}${indexed[2]}`
  return plainText(source)
}
export function plainText(value: string): string {
  return value.replace(/<(?:br\s*\/?|\/p|\/div)>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim()
}
export function fieldLabel(node: UiNode) { return chinese(node.label || (fieldLabels as Record<string, string>)[node.name] || node.name) }
