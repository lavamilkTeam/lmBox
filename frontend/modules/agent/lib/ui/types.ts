export interface AgentFileView { name: string; size: number }
export interface AgentArtifactView { id: string; name: string; mimeType: string }
export interface AgentTurnView {
  id: string
  prompt: string
  files: AgentFileView[]
  status: 'submitting' | 'unconfirmed' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  events: string[]
  answer: string
  error: string
  artifacts: AgentArtifactView[]
}
