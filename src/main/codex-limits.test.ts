import { describe, it, expect } from 'vitest'
import { parseCodexLimits } from './codex-limits'

const line = JSON.stringify({
  timestamp: '2026-01-15T10:00:00.000Z',
  type: 'event_msg',
  payload: {
    type: 'token_count',
    rate_limits: {
      limit_id: 'codex',
      plan_type: 'plus',
      primary: { used_percent: 42, window_minutes: 300, resets_at: 1900000000 },
      secondary: { used_percent: 13, window_minutes: 10080, resets_at: 1900900000 },
    },
  },
})

describe('parseCodexLimits', () => {
  it('parses primary (5h) and weekly windows + plan type + asOf', () => {
    const r = parseCodexLimits(line)
    expect(r).not.toBeNull()
    expect(r!.primary).toEqual({ usedPercent: 42, windowMinutes: 300, resetsAt: 1900000000 })
    expect(r!.weekly).toEqual({ usedPercent: 13, windowMinutes: 10080, resetsAt: 1900900000 })
    expect(r!.planType).toBe('plus')
    expect(r!.asOf).toBe(Date.parse('2026-01-15T10:00:00.000Z'))
  })

  it('returns null for a line without rate_limits', () => {
    expect(parseCodexLimits(JSON.stringify({ payload: { type: 'token_count' } }))).toBeNull()
  })

  it('returns null for non-JSON', () => {
    expect(parseCodexLimits('not json')).toBeNull()
  })

  it('tolerates a missing window (e.g. only primary present)', () => {
    const partial = JSON.stringify({
      timestamp: '2026-01-15T09:00:00.000Z',
      payload: {
        rate_limits: {
          plan_type: 'pro',
          primary: { used_percent: 5, window_minutes: 300, resets_at: 111 },
        },
      },
    })
    const r = parseCodexLimits(partial)
    expect(r!.primary?.usedPercent).toBe(5)
    expect(r!.weekly).toBeNull()
    expect(r!.planType).toBe('pro')
  })
})
