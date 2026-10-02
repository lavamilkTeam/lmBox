import type { GraphicsIr } from './graphics'

export interface ModelSettings { thickness:number; margin:number; compensation:number; mirror:boolean }
export interface PreviewRequest {
  protocolVersion:'1'; projectId:string; jobId:string; inputRevision:number;
  ir:GraphicsIr; settings:ModelSettings;
}
export interface PreviewMesh {
  positions:number[]; indices:number[]; contours:number[][][];
  summary:{bounds:number[][];volume:number;holeCount:number;triangleCount:number;tolerance:number;unit:'mm'};
}
export interface PreviewResult {
  protocolVersion:'1'; projectId:string; jobId:string; inputRevision:number; mesh:PreviewMesh;
}
