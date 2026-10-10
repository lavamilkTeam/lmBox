import type { GraphicsIr } from './graphics'

/** Wire shape from contracts/schemas/v1/import.schema.json. */
export interface ImportedLayer {
  name: string
  size: number
  role: 'top-paste' | 'bottom-paste' | 'outline' | 'other'
  ir?: GraphicsIr
  diagnostic?: { code:string; message:string; line?:number }
}
export interface ImportResult {
  protocolVersion: '1'
  layers: ImportedLayer[]
}
