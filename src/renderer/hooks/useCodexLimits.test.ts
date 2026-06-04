import { describe, it, expect } from 'vitest'
import { computeClaudeWindow, resolveWindow } from './useCodexLimits'
import type { Session, PlanWindow } from '../../shared/types'

const session = (over: Partial<Session>): Session =>
  ({
    id: 's',
    projectId: 'p',
    status: 'running',
    startedAt: 0,
    approvalState: 'idle',
    seedTemplateId: null,
    ...over,
  }) as Session

describe('resolveWindow', () => {
  const now = 2_000_000 // ms
  it('passes a window through when not yet reset', () => {
    const w: PlanWindow = {
      usedPercent: 40,
      windowMinutes: 300,
      resetsAt: Math.floor(now / 1000) + 600,
    }
    expect(resolveWindow(w, now)).toEqual({
      usedPercent: 40,
      windowMinutes: 300,
      resetsAt: w.resetsAt,
      resetsInSec: 600,
    })
  })
  it('reports 0% once the window has reset (resets_at in the past)', () => {
    const w: PlanWindow = {
      usedPercent: 80,
      windowMinutes: 300,
      resetsAt: Math.floor(now / 1000) - 10,
    }
    const r = resolveWindow(w, now)
    expect(r!.usedPercent).toBe(0)
    expect(r!.resetsInSec).toBe(0)
  })
  it('returns null for a null window', () => {
    expect(resolveWindow(null, now)).toBeNull()
  })
})

describe('computeClaudeWindow', () => {
  const now = 10 * 3_600_000 // 10h in ms
  const fiveHAgo = now - 5 * 3_600_000
  it('counts claude sessions active within the last 5h and sums their time', () => {
    const sessions = {
      a: session({ id: 'a', startedAt: fiveHAgo + 3_600_000 }), // 4h ago → 4h active
      old: session({ id: 'old', startedAt: fiveHAgo - 3_600_000 }), // 6h ago → excluded
    }
    const r = computeClaudeWindow({ sessions, now })
    expect(r.sessions).toBe(1)
    expect(r.activeMs).toBe(4 * 3_600_000)
  })
})
