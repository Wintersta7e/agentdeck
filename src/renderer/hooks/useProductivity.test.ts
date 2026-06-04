import { describe, it, expect } from 'vitest'
import { computeTodayProductivity } from './useProductivity'
import type { DailyUsageEntry, Session } from '../../shared/types'
import { todayIsoKey } from '../../shared/date-keys'

const session = (over: Partial<Session>): Session =>
  ({
    id: 's1',
    projectId: 'p1',
    status: 'running',
    startedAt: 0,
    approvalState: 'idle',
    seedTemplateId: null,
    ...over,
  }) as Session

describe('computeTodayProductivity', () => {
  const midnight = new Date(`${todayIsoKey()}T00:00:00`).getTime()
  const persisted: DailyUsageEntry[] = [
    {
      date: todayIsoKey(),
      sessions: 2,
      activeMs: 120000,
      filesChanged: 5,
      perProject: {},
      perAgent: {},
    },
  ]

  it('falls back to persisted totals when no live sessions today', () => {
    const r = computeTodayProductivity({
      usageHistory: persisted,
      sessions: {},
      writeCounts: {},
      midnight,
      now: midnight + 1000,
    })
    expect(r.sessions).toBe(2)
    expect(r.filesChanged).toBe(5)
    expect(r.activeMs).toBe(120000)
  })

  it('adds live in-flight sessions started today on top of persisted', () => {
    const sessions = { live1: session({ id: 'live1', startedAt: midnight + 1000 }) }
    const r = computeTodayProductivity({
      usageHistory: persisted,
      sessions,
      writeCounts: { live1: 4 },
      midnight,
      now: midnight + 61000, // 60s after start
    })
    expect(r.sessions).toBe(3)
    expect(r.filesChanged).toBe(9)
    expect(r.activeMs).toBe(120000 + 60000)
  })

  it('does not double-count an exited session already in persisted history', () => {
    const persistedWithExited: DailyUsageEntry[] = [
      {
        date: todayIsoKey(),
        sessions: 1,
        activeMs: 59000,
        filesChanged: 3,
        perProject: {},
        perAgent: {},
      },
    ]
    const r = computeTodayProductivity({
      usageHistory: persistedWithExited,
      sessions: { done: session({ id: 'done', startedAt: midnight + 1000, status: 'exited' }) },
      writeCounts: { done: 3 },
      midnight,
      now: midnight + 60000,
    })
    expect(r.sessions).toBe(1)
    expect(r.filesChanged).toBe(3)
    expect(r.activeMs).toBe(59000)
  })

  it('ignores live sessions started before midnight (already persisted)', () => {
    const sessions = { old: session({ id: 'old', startedAt: midnight - 5000 }) }
    const r = computeTodayProductivity({
      usageHistory: persisted,
      sessions,
      writeCounts: { old: 9 },
      midnight,
      now: midnight + 1000,
    })
    expect(r.sessions).toBe(2)
    expect(r.filesChanged).toBe(5)
  })
})
