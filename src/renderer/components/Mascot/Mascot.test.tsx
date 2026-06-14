import { describe, it, expect } from 'vitest'
import { deriveMascotState } from './Mascot'

const base = { greeting: false, hovering: false, errorCount: 0, runningCount: 0, hour: 12 }

describe('deriveMascotState', () => {
  it('enters sleep at 23:00', () => {
    expect(deriveMascotState({ ...base, hour: 23 })).toBe('sleep')
  })

  it('stays asleep before 06:00', () => {
    expect(deriveMascotState({ ...base, hour: 5 })).toBe('sleep')
  })

  it('wakes at 06:00', () => {
    expect(deriveMascotState({ ...base, hour: 6 })).toBe('bored')
  })

  it('shows working when sessions run during the day', () => {
    expect(deriveMascotState({ ...base, hour: 12, runningCount: 2 })).toBe('working')
  })

  it('errors outrank the sleep window', () => {
    expect(deriveMascotState({ ...base, hour: 2, errorCount: 1 })).toBe('alert')
  })

  it('greeting and hover take precedence over everything', () => {
    expect(deriveMascotState({ ...base, hour: 2, greeting: true })).toBe('greet')
    expect(deriveMascotState({ ...base, hour: 2, hovering: true, errorCount: 5 })).toBe('hover')
  })
})
