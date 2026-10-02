import type { GraphicsIr, ImportedLayer, PreviewMesh } from '../../../contracts'

export type ViewMode = '2d' | '3d' | 'gcode'
export type LayerFile = ImportedLayer
export interface LogEntry { id: number; time: string; level: 'info' | 'success' | 'warning'; message: string }
export interface Aperture { x: number; y: number; width: number; height: number; round?: boolean }
export interface Parameters {
  side: 'top' | 'bottom'; grid: boolean; outline: boolean; mirror: boolean; opacity: number;
  thickness: number; margin: number; compensation: number;
  layerHeight: number; nozzle: number; speed: number; temperature: number; bedTemperature: number; showTravel: boolean; layer: number;
}
export interface BoardDocument {
  id: string; name: string; demo: boolean; mode: ViewMode; dirty: boolean;
  files: LayerFile[]; logs: LogEntry[]; params: Parameters;
  width: number | null; height: number | null; apertures: Aperture[];
  /** Parsed graphics IR from Rust; the 2D preview renders this. */
  ir?: GraphicsIr;
  selectedLayer: string;
  model: ModelState;
  view: { zoom:number; panX:number; panY:number };
}

export interface ModelState { revision:number; jobId:string; status:"idle"|"building"|"ready"|"error"|"cancelled"; error:string; mesh?:PreviewMesh }
