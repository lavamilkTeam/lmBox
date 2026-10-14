import type { DesignIdentity, DesignRequest, DesignResult } from '../../../contracts'
import { isNativeDesktop, nativePropulsion } from './native'

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const numbers = (v: Record<string, unknown>, keys: string[]) => keys.every(k => typeof v[k] === 'number' && Number.isFinite(v[k]))
const strings = (v: unknown) => Array.isArray(v) && v.length <= 100 && v.every(s => typeof s === 'string' && s.length <= 4096)
function identity(v: unknown, expected: DesignIdentity) {
  return record(v) && v.schemaVersion === 1 && v.projectId === expected.projectId && v.jobId === expected.jobId && v.inputRevision === expected.inputRevision
}
function circuit(v: unknown) {
  return record(v) && numbers(v, ['massFlowKgS', 'massFlowPerElementKgS', 'totalFlowAreaM2', 'areaPerElementM2', 'innerDiameterM', 'outerDiameterM', 'hydraulicDiameterM', 'meanVelocityMS', 'reynoldsNumber'])
    && (v.outerDiameterM as number) > (v.innerDiameterM as number) && (v.innerDiameterM as number) >= 0
}
function chamber(v: unknown) {
  const point = (p: unknown) => record(p) && numbers(p, ['xM', 'radiusM']) && (p.radiusM as number) > 0
  return record(v) && numbers(v, ['inletXM', 'convergentStartXM', 'innerRadiusM', 'contractionRatio', 'cylinderLengthM', 'convergentLengthM', 'totalLengthM', 'inletArcRadiusM', 'throatArcRadiusM', 'joinAngleDeg'])
    && (v.inletXM as number) < (v.convergentStartXM as number) && (v.convergentStartXM as number) < 0
    && (v.totalLengthM as number) > 0 && (v.innerRadiusM as number) > 0
    && point(v.firstPoint) && point(v.secondPoint) && Array.isArray(v.contour) && v.contour.length >= 6 && v.contour.length <= 6146
    && v.contour.every((p, i, arr) => point(p) && (p.xM as number) <= 0 && (i === 0 || p.xM > arr[i - 1].xM))
}
function validate(value: unknown, request: DesignRequest): DesignResult {
  if (!record(value) || value.type !== request.type || !record(value.result) || !identity(value.result.identity, request.request.identity)) throw new Error('计算结果与当前任务不匹配。')
  const r = value.result
  let valid = strings(r.assumptions)
  if (value.type === 'injector') valid &&= r.modelVersion === 'injector-hydraulics/1' && circuit(r.oxidizer) && circuit(r.fuel)
  else {
    if (request.type === 'nozzle' && request.request.chamber) valid &&= chamber(r.chamberGeometry)
    else valid &&= r.chamberGeometry === undefined
    const cea = r.cea
    valid &&= r.modelVersion === 'nozzle-preliminary/1' && numbers(r, ['throatAreaM2', 'exitAreaM2', 'throatRadiusM', 'exitRadiusM', 'divergentLengthM', 'massFlowKgS', 'idealThrustN', 'idealSpecificImpulseS', 'idealThrustCoefficient'])
      && (r.divergentLengthM as number) > 0 && (r.exitRadiusM as number) > 0
      && (r.conicalDivergenceFactor === null || typeof r.conicalDivergenceFactor === 'number' && Number.isFinite(r.conicalDivergenceFactor))
      && strings(r.warnings) && Array.isArray(r.contour) && r.contour.length >= 9 && r.contour.length <= 4097
      && r.contour.every(p => record(p) && numbers(p, ['xM', 'radiusM']) && (p.xM as number) >= 0 && (p.radiusM as number) > 0)
      && record(cea) && identity(cea, request.request.identity) && cea.converged === true && typeof cea.engineVersion === 'string'
      && record(cea.solution) && cea.solution.type === 'rocket' && Array.isArray(cea.solution.stations)
      && cea.solution.stations.length === 3 && cea.solution.stations.every((s, index) => record(s)
        && s.kind === ['chamber', 'throat', 'exit'][index] && numbers(s, ['mach']) && record(s.state)
        && numbers(s.state, ['temperatureK', 'pressurePa', 'densityKgM3', 'enthalpyJKg', 'entropyJKgK', 'cpJKgK', 'gammaS', 'molecularWeightKgKmol'])
        && Array.isArray(s.state.species) && s.state.species.length <= 10000 && s.state.species.every(p => record(p) && typeof p.species === 'string' && numbers(p, ['massFraction']))
        && (index === 0 ? s.performance === null : record(s.performance) && numbers(s.performance, ['areaRatio', 'cStarMS', 'matchedThrustCoefficient', 'matchedSpecificImpulseS', 'vacuumSpecificImpulseS'])))
  }
  if (!valid) throw new Error('计算结果不完整或包含无效数值。')
  return value as unknown as DesignResult
}
export async function calculatePropulsion(request: DesignRequest, signal: AbortSignal): Promise<DesignResult> {
  if (signal.aborted) throw new DOMException('已停止等待。', 'AbortError')
  let result: unknown
  if (isNativeDesktop()) result = await nativePropulsion(request)
  else {
    const response = await fetch('/api/propulsion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal })
    try { result = await response.json() }
    catch { throw new Error('计算服务不可用，请从本地应用打开。') }
    if (!response.ok) throw new Error(record(result) && typeof result.error === 'string' ? result.error : '计算失败，请检查输入后重试。')
  }
  if (signal.aborted) throw new DOMException('已停止等待。', 'AbortError')
  return validate(result, request)
}
