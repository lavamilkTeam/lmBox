import { beforeEach, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDesignStore } from '../index'
import type { DesignResult } from '../../../../../../contracts'
import nozzleFixture from '../../../../../../../contracts/fixtures/v1/propulsion-chamber-request.json'
import injectorFixture from '../../../../../../../contracts/fixtures/v1/propulsion-injector-request.json'
beforeEach(() => setActivePinia(createPinia()))
it('maps example parameters to the existing public request fixtures', () => {
  const store = useDesignStore()
  for (const [kind, fixture] of [['nozzle', nozzleFixture], ['injector', injectorFixture]] as const) {
    const request = store.begin(kind)
    expect({ ...request.request, identity: fixture.request.identity }).toEqual(fixture.request)
  }
})
it('rejects late responses after an edit, a newer job or a reset', () => {
  const store = useDesignStore(), first = store.begin('nozzle')
  const response = { type: 'nozzle', result: { identity: first.request.identity } } as DesignResult
  store.edit('nozzle')
  expect(store.accept(first, response)).toBe(false)
  const second = store.begin('nozzle')
  expect(store.accept(first, response)).toBe(false)
  store.reset('nozzle')
  expect(store.accept(second, response)).toBe(false)
  expect(store.nozzleSession.result).toBeNull()
})
it('isolates module sessions, rejects mismatched results and refuses empty numbers', () => {
  const store = useDesignStore(), request = store.begin('injector')
  const response = { type: 'injector', result: { identity: { ...request.request.identity, projectId: 'wrong' } } } as DesignResult
  expect(() => store.accept(request, response)).toThrow('不匹配')
  store.edit('nozzle')
  expect(store.injectorSession.pending).toBe(request.request.identity.jobId)
  store.nozzleSession.draft.massFlowKgS = NaN
  expect(() => store.begin('nozzle')).toThrow('数值')
  store.cancel('injector')
  store.fail(request, 'late failure')
  expect(store.injectorSession.error).toBe('')
})
