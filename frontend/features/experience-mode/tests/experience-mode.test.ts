import { effectScope, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useExperienceMode } from '..'

describe('experience mode', () => {
  it('waits for known guest status and prompts once until another authenticated session ends', () => {
    const scope = effectScope()
    try {
      scope.run(() => {
        const status = ref<'unknown' | 'guest' | 'authenticated'>('unknown')
        const experience = useExperienceMode(status)
        expect(experience.open.value).toBe(false)
        status.value = 'authenticated'
        expect(experience.open.value).toBe(false)
        status.value = 'guest'
        expect(experience.open.value).toBe(true)
        experience.setOpen(false)
        status.value = 'unknown'
        status.value = 'guest'
        expect(experience.open.value).toBe(false)
        status.value = 'authenticated'
        status.value = 'guest'
        expect(experience.open.value).toBe(true)
        status.value = 'authenticated'
        expect(experience.open.value).toBe(false)
      })
    } finally { scope.stop() }
  })

  it('retains the selected layout when reopened or dismissed', () => {
    const scope = effectScope()
    try {
      scope.run(() => {
        const experience = useExperienceMode('guest')
        expect(experience.mode.value).toBe('advanced')
        experience.select('agent')
        expect(experience.open.value).toBe(false)
        experience.setOpen(true)
        experience.setOpen(false)
        expect(experience.mode.value).toBe('agent')
        experience.select('advanced')
        expect(experience.mode.value).toBe('advanced')
      })
    } finally { scope.stop() }
  })
})
