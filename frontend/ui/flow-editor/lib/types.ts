export interface ToolView {
  id: string
  label: string
  category: string
  description?: string
  kind: string
  available: boolean
}
export interface NodeView extends Omit<ToolView, 'id'> {
  id: string; x: number; y: number; inputPorts?: readonly string[]
  width?: number; height?: number
  ports?: { inputs: readonly { id: string; x: number; y: number; side?: 'left' | 'top' }[]; output: { x: number; y: number } | null }
}
export interface EdgeView { id: string; source: string; target: string; targetPort?: string }
