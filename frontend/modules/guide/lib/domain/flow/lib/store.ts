import { defineStore } from 'pinia'
import { ref } from 'vue'

export const guideTools = [
  { id: 'stencil', label: '钢网设计与制造', category: '电子电气', description: '从图层导入到钢网建模与制造', kind: 'electrical', available: true },
  { id: 'digital-logic', label: '数字逻辑仿真', category: '电子电气', description: '逻辑门与数字逻辑电路仿真', kind: 'electrical', available: true },
  { id: 'equilibrium', label: '化学平衡分析', category: '热化学', description: '组织热化学与平衡分析流程', kind: 'chemistry', available: false },
  { id: 'cfd', label: '流体力学', category: '流体与动力', description: '几何导入、网格、流动物理模型与求解', kind: 'fluid', available: true },
  { id: 'nozzle', label: '喷管初步设计', category: '流体与动力', description: '喷管轮廓、尺寸与性能计算', kind: 'fluid', available: true },
  { id: 'video', label: '视频工作流', category: 'AI', description: '云端模型视频生成工作流', kind: 'ai', available: true },
  { id: 'agent', label: 'AI 工作助手', category: 'AI', description: '工具调用与工作文件处理', kind: 'ai', available: true },
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
