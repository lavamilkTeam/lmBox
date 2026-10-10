/** Hand-maintained mapping of contracts/schemas/v1/ai-*.schema.json. */
export type AiCapability = 'video' | 'agent'
export type AiValue = null | boolean | number | string | AiValue[] | { [key: string]: AiValue }
export interface AiNodeInput { name: string; type: string; required: boolean; choices?: (string | number | boolean)[]; default?: AiValue; min?: number; max?: number }
export interface AiNodeDefinition { type: string; title: string; category: string; inputs: AiNodeInput[]; outputs: { name: string; type: string }[] }
export interface AiWorkflowNode { id: string; type: string; inputs: Record<string, AiValue>; x: number; y: number }
export interface AiWorkflow { nodes: AiWorkflowNode[] }
export interface AiArtifact { id: string; name: string; mimeType: string }
export interface AiError { code: string; message: string }
export interface AiJob {
  jobId: string; capability: AiCapability; inputRevision: number
  status: 'running' | 'succeeded' | 'failed' | 'cancelled'
  events: { message: string }[]
  result?: { text?: string; artifacts: AiArtifact[] }
  error?: AiError
}
export interface AiRequest {
  schemaVersion: 1; projectId: string; requestId: string; inputRevision: number; capability: AiCapability
  operation: 'inspect' | 'start' | 'status' | 'cancel' | 'artifact'
  jobId?: string; payload?: Record<string, unknown>
}
export interface AiData {
  job?: AiJob; configured?: boolean; nodes?: AiNodeDefinition[]; model?: string; tools?: string[]
  name?: string; mimeType?: string; base64?: string
}
export interface AiResponse {
  schemaVersion: 1; projectId: string; requestId: string; inputRevision: number; capability: AiCapability
  ok: boolean; data?: AiData; error?: AiError
}
