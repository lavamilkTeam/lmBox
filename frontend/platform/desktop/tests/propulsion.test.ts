import { afterEach, expect, it, vi } from 'vitest'
import { calculatePropulsion } from '../index'
import type { DesignRequest, DesignResult } from '../../../contracts'
import fixture from '../../../../contracts/fixtures/v1/propulsion-injector-request.json'
const native = vi.hoisted(() => ({ invoke: vi.fn(), enabled: false }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => native.enabled, invoke: native.invoke }))
const request = fixture as DesignRequest
function result(): DesignResult {
  const circuit = { massFlowKgS: .1, massFlowPerElementKgS: .01, totalFlowAreaM2: .001, areaPerElementM2: .0001, innerDiameterM: 0, outerDiameterM: .01, hydraulicDiameterM: .01, meanVelocityMS: 10, reynoldsNumber: 1000 }
  return { type: 'injector', result: { identity: request.request.identity, modelVersion: 'injector-hydraulics/1', oxidizer: circuit, fuel: { ...circuit }, assumptions: [] } }
}
afterEach(() => { vi.unstubAllGlobals(); native.enabled = false; native.invoke.mockReset() })
it('checks identity and finite dimensions from the real transport boundary', async () => {
  const response = result()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(response))))
  expect(await calculatePropulsion(request, new AbortController().signal)).toEqual(response)
  response.result.identity = { ...request.request.identity, inputRevision: 999 }
  await expect(calculatePropulsion(request, new AbortController().signal)).rejects.toThrow('不匹配')
  response.result.identity = request.request.identity
  if (response.type === 'injector') response.result.oxidizer.outerDiameterM = NaN
  await expect(calculatePropulsion(request, new AbortController().signal)).rejects.toThrow('无效数值')
})
it('rejects static hosting and reports server failures', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>static</html>')))
  await expect(calculatePropulsion(request, new AbortController().signal)).rejects.toThrow('本地应用')
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: '计算繁忙' }), { status: 429 })))
  await expect(calculatePropulsion(request, new AbortController().signal)).rejects.toThrow('计算繁忙')
})
it('uses native IPC and discards responses after stopping the wait', async () => {
  native.enabled = true; vi.stubGlobal('window', {})
  const abort = new AbortController()
  native.invoke.mockImplementation(async () => { abort.abort(); return result() })
  await expect(calculatePropulsion(request, abort.signal)).rejects.toMatchObject({ name: 'AbortError' })
  expect(native.invoke).toHaveBeenCalledWith('propulsion_run', { request })
  native.invoke.mockResolvedValueOnce(result())
  expect(await calculatePropulsion(request, new AbortController().signal)).toEqual(result())
})
