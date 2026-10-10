import { defineStore } from 'pinia'
import { ref } from 'vue'

export const guideTools = [
  { id: 'stencil', label: '钢网设计与制造', category: '电子电气', description: '从图层导入到钢网建模与制造', kind: 'electrical', available: true },
  { id: 'equilibrium', label: '化学平衡分析', category: '热化学', description: '组织热化学与平衡分析流程', kind: 'chemistry', available: false },
  { id: 'rocket', label: '火箭发动机性能分析', category: '流体与动力', description: '组织发动机性能分析流程', kind: 'fluid', available: false },
  { id: 'nozzle', label: '喷管初步设计', category: '流体与动力', description: '喷管轮廓、尺寸与性能计算', kind: 'fluid', available: true },
  { id: 'injector', label: '喷注器水力设计', category: '流体与动力', description: '流量分配与流道尺寸计算', kind: 'fluid', available: true },
] as const

interface FlowNode { id: string; toolId: string; x: number; y: number }
interface FlowEdge { id: string; source: string; target: string }

// This is a session-only flow draft, not a native engineering project or execution graph.
export const useGuideFlow = defineStore('guide-flow', () => {
  const nodes = ref<FlowNode[]>([])
  const edges = ref<FlowEdge[]>([])
  let nextId = 1

  function add(toolId: string, x: number, y: number) {
    if (!guideTools.some(tool => tool.id === toolId) || !Number.isFinite(x) || !Number.isFinite(y)) return
    const node = { id: `node-${nextId++}`, toolId, x: Math.max(24, x), y: Math.max(24, y) }
    nodes.value.push(node)
    return node.id
  }
  function move(id: string, x: number, y: number) {
    const node = nodes.value.find(node => node.id === id)
    if (node && Number.isFinite(x) && Number.isFinite(y)) {
      node.x = Math.max(24, x)
      node.y = Math.max(24, y)
    }
  }
  function connect(source: string, target: string): string {
    if (!nodes.value.some(node => node.id === source) || !nodes.value.some(node => node.id === target)) return '节点已不存在'
    if (source === target) return '请选择另一个功能节点'
    if (edges.value.some(edge => edge.source === source && edge.target === target)) return '这两个节点已连接'
    const visited = new Set<string>()
    function reaches(id: string): boolean {
      if (id === source) return true
      if (visited.has(id)) return false
      visited.add(id)
      return edges.value.filter(edge => edge.source === id).some(edge => reaches(edge.target))
    }
    if (reaches(target)) return '不能连接成循环流程'
    edges.value.push({ id: `edge-${nextId++}`, source, target })
    return ''
  }
  function removeNode(id: string) {
    nodes.value = nodes.value.filter(node => node.id !== id)
    edges.value = edges.value.filter(edge => edge.source !== id && edge.target !== id)
  }
  function removeEdge(id: string) { edges.value = edges.value.filter(edge => edge.id !== id) }
  return { nodes, edges, add, move, connect, removeNode, removeEdge }
})
