export interface VideoField {
  name: string; type: string; required: boolean; secret: boolean
  choices?: (string | number | boolean)[]; min?: number; max?: number
  value?: unknown; connection?: { nodeId: string; outputIndex: number }
}
export interface VideoNode { id: string; type: string; title: string; x: number; y: number; inputs: VideoField[]; outputs: { name: string; type: string }[] }
export interface CatalogEntry { type: string; title: string; category: string }
export interface VideoArtifact { id: string; name: string; mimeType: string; url?: string }
