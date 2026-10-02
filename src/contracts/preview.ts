import type { GraphicsIr } from './graphics'

export interface Optimization { scale:number; rounding:number; grid:boolean; gridThreshold:number; gridCell:number; gridWeb:number; stagger:boolean; gap:number; staggerOffset:number; staggerShrink:number; taper:number; inverseTaper?:boolean; xyMode?:'off'|'upper'|'whole'|'opposed'; xyScaleX?:number; xyScaleY?:number }
export interface DesignSettings { cornerStyles?:Record<'TL'|'TR'|'BL'|'BR','round'|'chamfer'>; kind:'stencil'|'base'; frame:'bounds'|'outline'; extraLeft:number; extraRight:number; extraTop:number; extraBottom:number; cornerStyle:'round'|'chamfer'; cornerTL:number; cornerTR:number; cornerBL:number; cornerBR:number; boardThickness:number; clearance:number; floor:number; slotWidth:number; chamfer:number; optimization:Optimization }
export interface ObjectEdit { id:string; dx:number; dy:number; scaleX:number; scaleY:number; rotation:number; compensation:number; deleted:boolean; optimization?:Optimization }
export type ExportFormat = 'stl'|'svg'|'dxf'
export interface DisplayObject { id:string; rings:number[][][]; deleted:boolean }
export interface ModelSettings { thickness:number; margin:number; compensation:number; mirror:boolean; design?:DesignSettings }
export interface PreviewRequest {
  protocolVersion:'1'; projectId:string; jobId:string; inputRevision:number;
  ir:GraphicsIr; settings:ModelSettings; outline?:GraphicsIr; edits?:ObjectEdit[]; exportFormat?:ExportFormat;
}
export interface PreviewMesh {
  positions:number[]; indices:number[]; contours:number[][][]; objects?:DisplayObject[];
  summary:{bounds:number[][];volume:number;holeCount:number;triangleCount:number;tolerance:number;unit:'mm';algorithmVersion?:string};
}
export interface PreviewResult {
  protocolVersion:'1'; projectId:string; jobId:string; inputRevision:number; mesh:PreviewMesh; artifact?:{format:ExportFormat;content:string};
}
