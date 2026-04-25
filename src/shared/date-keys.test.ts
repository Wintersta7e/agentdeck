import { describe, it, expect } from 'vitest'
import { isoKeyFromTs, todayIsoKey } from './date-keys'

describe('date-keys', () => {
  it('isoKeyFromTs returns local YYYY-MM-DD for an arbitrary timestamp', () => {
    // Pick noon on a fixed local calendar day
    const d = new Date(2026, 3, 14, 12, 0, 0, 0)
    expect(isoKeyFromTs(d.getTime())).toBe('2026-04-14')
  })

  it('zero-pads month and day', () => {
    const d = new Date(2026, 0, 1, 12, 0, 0, 0)
    expect(isoKeyFromTs(d.getTime())).toBe('2026-01-01')
  })

  it('todayIsoKey matches isoKeyFromTs(Date.now()) for the same render', () => {
    const now = Date.now()
    expect(todayIsoKey()).toBe(isoKeyFromTs(now))
  })
})
