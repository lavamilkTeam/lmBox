export interface ToolView {
  id: string
  label: string
  category: string
  description: string
  kind: string
  available: boolean
}
export interface NodeView extends Omit<ToolView, 'id'> { id: string; x: number; y: number }
export interface EdgeView { id: string; source: string; target: string }
