import type { AiNodeDefinition, AiValue, AiWorkflow, AiWorkflowNode } from '../../../../../../contracts'

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
export function isCredentialField(name: string): boolean {
  const normalized = name.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return ['apikey', 'authtoken', 'accesstoken', 'password', 'secret', 'authorization'].some(part => normalized.includes(part))
}
export function isDynamicInput(definition: AiNodeDefinition | undefined, name: string): boolean {
  return !!definition?.inputs.some(input => input.type === 'COMFY_DYNAMICCOMBO_V3'
    && name.startsWith(`${input.name}.`) && name.slice(input.name.length + 1).split('.').every(part => part.length > 0))
}
export function isLink(value: unknown): value is { nodeId: string; outputIndex: number } {
  return object(value) && typeof value.nodeId === 'string' && Number.isInteger(value.outputIndex) && (value.outputIndex as number) >= 0
}
function jsonValue(value: unknown, depth = 0): value is AiValue {
  if (depth > 20) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.length <= 10000 && value.every(item => jsonValue(item, depth + 1))
  return object(value) && Object.keys(value).length <= 1000 && Object.values(value).every(item => jsonValue(item, depth + 1))
}
export function defaultInput(input: AiNodeDefinition['inputs'][number]): AiValue | undefined {
  if (input.default !== undefined && jsonValue(input.default)) return structuredClone(input.default)
  if (input.choices?.length) return input.choices[0]
  if (!input.required) return undefined
  if (input.type === 'STRING') return ''
  if (input.type === 'INT' || input.type === 'FLOAT') return input.min ?? 0
  if (input.type === 'BOOLEAN') return false
  return undefined
}
export function compatible(source: string, target: string) {
  const a = source.split(',').map(item => item.trim()), b = target.split(',').map(item => item.trim())
  return a.includes('*') || b.includes('*') || a.some(type => b.includes(type))
}
/** Structural checks also run before a server catalog is available. */
export function validateGraph(nodes: AiWorkflowNode[], definitions?: AiNodeDefinition[], complete = false): string {
  if (!nodes.length && complete) return '请添加节点或导入工作流'
  if (nodes.length > 500) return '工作流最多允许 500 个节点'
  const ids = new Set<string>()
  for (const node of nodes) {
    if (!node.id || ids.has(node.id)) return '节点标识为空或重复'
    ids.add(node.id)
    if (!node.type || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return '节点类型或位置无效'
  }
  const visiting = new Set<string>(), done = new Set<string>()
  function cycle(id: string): boolean {
    if (visiting.has(id)) return true
    if (done.has(id)) return false
    visiting.add(id)
    const node = nodes.find(item => item.id === id)!
    if (Object.values(node.inputs).some(value => isLink(value) && ids.has(value.nodeId) && cycle(value.nodeId))) return true
    visiting.delete(id); done.add(id)
    return false
  }
  for (const node of nodes) {
    const definition = definitions?.find(item => item.type === node.type)
    if (definitions && !definition) return `节点 ${node.type} 不可用，请安装相应节点后刷新`
    for (const [name, value] of Object.entries(node.inputs)) {
      if (isCredentialField(name)) return '凭据必须由后端配置，请移除工作流中的凭据字段'
      const input = definition?.inputs.find(item => item.name === name)
      if (definition && !input && !isDynamicInput(definition, name)) return `${node.type} 不支持输入 ${name}`
      if (isLink(value)) {
        const source = nodes.find(item => item.id === value.nodeId)
        if (!source) return `${node.type}.${name} 引用了不存在的节点`
        if (definitions) {
          const output = definitions.find(item => item.type === source.type)?.outputs[value.outputIndex]
          if (!output || input && !compatible(output.type, input.type)) return `${node.type}.${name} 的连接类型不匹配`
        }
      } else {
        if (!jsonValue(value)) return `${node.type}.${name} 的值不是有效 JSON`
        if (!input) continue
        if (input.choices && !input.choices.includes(value as string | number | boolean)) return `${name} 的选项已不可用`
        if (input.type === 'INT' && (typeof value !== 'number' || !Number.isInteger(value))) return `${name} 必须为整数`
        if (input.type === 'FLOAT' && typeof value !== 'number') return `${name} 必须为数值`
        if (input.type === 'BOOLEAN' && typeof value !== 'boolean') return `${name} 必须为布尔值`
        if (input.type === 'STRING' && typeof value !== 'string') return `${name} 必须为文本`
        if (typeof value === 'number' && ((input.min !== undefined && value < input.min) || (input.max !== undefined && value > input.max))) return `${name} 超出允许范围`
        if (!input.choices && !['STRING', 'INT', 'FLOAT', 'BOOLEAN'].includes(input.type)) return `${name} 需要连接到 ${input.type} 输出端`
      }
    }
    if (complete && definition) for (const input of definition.inputs) {
      if (input.required && !isCredentialField(input.name) && !Object.hasOwn(node.inputs, input.name)) return `${definition.title}.${input.name} 缺少输入`
    }
    if (cycle(node.id)) return '工作流不能包含循环连接'
  }
  return ''
}
export function parseWorkflow(value: unknown): AiWorkflow {
  if (!object(value)) throw new Error('请选择工作流 JSON 文件')
  let nodes: AiWorkflowNode[]
  if (value.format === 'lmbox-video-workflow') {
    if (value.schemaVersion !== 1 || !object(value.workflow) || !Array.isArray(value.workflow.nodes)) throw new Error('不支持此工作流文档版本')
    nodes = value.workflow.nodes.map(item => {
      if (!object(item) || typeof item.id !== 'string' || typeof item.type !== 'string' || !object(item.inputs) || typeof item.x !== 'number' || typeof item.y !== 'number') throw new Error('工作流节点格式无效')
      if (!Object.values(item.inputs).every(input => jsonValue(input))) throw new Error('工作流输入格式无效')
      return { id: item.id, type: item.type, inputs: structuredClone(item.inputs) as AiWorkflowNode['inputs'], x: Math.max(16, item.x), y: Math.max(16, item.y) }
    })
  } else {
    if ('nodes' in value || 'links' in value) throw new Error('请在 ComfyUI 中导出 API 格式，或导入 lmBox 工作流文档')
    const prompt = object(value.prompt) ? value.prompt : value
    nodes = Object.entries(prompt).map(([id, item], index) => {
      if (!object(item) || typeof item.class_type !== 'string' || !object(item.inputs)) throw new Error('ComfyUI API 工作流节点格式无效')
      const inputs: AiWorkflowNode['inputs'] = Object.create(null)
      for (const [name, input] of Object.entries(item.inputs)) {
        if (Array.isArray(input) && input.length === 2 && typeof input[0] === 'string' && typeof input[1] === 'number' && Number.isInteger(input[1]) && input[1] >= 0) inputs[name] = { nodeId: input[0], outputIndex: input[1] }
        else if (jsonValue(input)) inputs[name] = structuredClone(input)
        else throw new Error(`输入 ${name} 格式无效`)
      }
      return { id, type: item.class_type, inputs, x: 40 + (index % 4) * 290, y: 40 + Math.floor(index / 4) * 320 }
    })
  }
  const error = validateGraph(nodes)
  if (error) throw new Error(error)
  return { nodes }
}
export function exportWorkflow(nodes: AiWorkflowNode[], api: boolean): string {
  const result = api
    ? Object.fromEntries(nodes.map(node => [node.id, { class_type: node.type, inputs: Object.fromEntries(Object.entries(node.inputs).map(([name, value]) => [name, isLink(value) ? [value.nodeId, value.outputIndex] : value])) }]))
    : { format: 'lmbox-video-workflow', schemaVersion: 1, workflow: { nodes } }
  return JSON.stringify(result, null, 2)
}
