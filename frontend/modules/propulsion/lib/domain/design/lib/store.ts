import { defineStore } from 'pinia'
import { reactive } from 'vue'
import type { DesignRequest, DesignResult, InjectorRequest, NozzleRequest } from '../../../../../../contracts'

function identity() { return { schemaVersion: 1 as const, projectId: crypto.randomUUID(), jobId: '', inputRevision: 0 } }
function nozzle(): NozzleRequest {
  return { identity: identity(), reactants: [{ species: 'H2(L)', massFraction: 0.15263516989057585, temperatureK: 20.27 }, { species: 'O2(L)', massFraction: 0.8473648301094242, temperatureK: 90.17 }], chemistry: 'equilibrium', chamberPressurePa: 5331720, massFlowKgS: 1, ambientPressurePa: 0, expansionRatio: 25, segments: 32, chamber: { innerDiameterM: .08, cylinderLengthM: .12, convergence: { type: 'filletedCone', halfAngleDeg: 30, inletRadiusM: .012, throatRadiusM: .018 } }, contour: { type: 'conical', halfAngleDeg: 15, throatArcRadiusRatio: 0.5 } }
}
function injector(): InjectorRequest {
  return { identity: identity(), totalMassFlowKgS: 0.3, oxidizerFuelMassRatio: 2,
    oxidizer: { densityKgM3: 1000, dynamicViscosityPaS: 0.001, pressureDropPa: 100000, dischargeCoefficient: 0.7, elementCount: 10, passage: { type: 'circular' } },
    fuel: { densityKgM3: 1000, dynamicViscosityPaS: 0.001, pressureDropPa: 100000, dischargeCoefficient: 0.7, elementCount: 10, passage: { type: 'annular', innerDiameterM: 0.002 } } }
}
interface Session<T> { draft: T; revision: number; example: boolean; pending: string | null; result: DesignResult | null; submitted: DesignRequest | null; error: string }
const session = <T>(draft: T): Session<T> => ({ draft, revision: 0, example: true, pending: null, result: null, submitted: null, error: '' })
function finite(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v)
  if (v && typeof v === 'object') return Object.values(v).every(finite)
  return true
}
export const useDesignStore = defineStore('propulsion-design', () => {
  const drawingNotes = reactive({ title: '燃烧室与喷管内流道', drawingNumber: '', material: '', wallThickness: '', cooling: '', connection: '', tolerance: '', roughness: '', standard: '' })
  const nozzleSession = reactive(session(nozzle()))
  const injectorSession = reactive(session(injector()))
  const get = (kind: 'nozzle' | 'injector') => kind === 'nozzle' ? nozzleSession : injectorSession
  function edit(kind: 'nozzle' | 'injector') {
    const s = get(kind); s.revision++; s.example = false; s.pending = null; s.error = ''
  }
  function reset(kind: 'nozzle' | 'injector') {
    edit(kind)
    if (kind === 'nozzle') nozzleSession.draft = nozzle()
    else injectorSession.draft = injector()
    const s = get(kind); s.result = null; s.submitted = null; s.example = true
  }
  function begin(kind: 'nozzle' | 'injector'): DesignRequest {
    const s = get(kind)
    if (!finite(s.draft)) throw new Error('请填写所有数值参数。')
    const request = JSON.parse(JSON.stringify({ type: kind, request: s.draft })) as DesignRequest
    request.request.identity = { ...s.draft.identity, jobId: crypto.randomUUID(), inputRevision: s.revision }
    s.pending = request.request.identity.jobId; s.error = ''
    return request
  }
  function accept(request: DesignRequest, result: DesignResult): boolean {
    const s = get(request.type), id = request.request.identity
    if (s.pending !== id.jobId || s.revision !== id.inputRevision || s.draft.identity.projectId !== id.projectId) return false
    const actual = result.result.identity
    if (result.type !== request.type || actual.schemaVersion !== 1 || actual.projectId !== id.projectId || actual.jobId !== id.jobId || actual.inputRevision !== id.inputRevision) throw new Error('计算结果与当前任务不匹配。')
    s.result = result; s.submitted = request; s.pending = null; return true
  }
  function fail(request: DesignRequest, message: string) {
    const s = get(request.type)
    if (s.pending === request.request.identity.jobId) { s.pending = null; s.error = message }
  }
  function cancel(kind: 'nozzle' | 'injector') { get(kind).pending = null }
  return { drawingNotes, nozzleSession, injectorSession, edit, reset, begin, accept, fail, cancel }
})
