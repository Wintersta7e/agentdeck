import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { computeTimeline } from '../useSessionTimeline'
import { makeSession, makeActivityEvent } from '../../../__test__/helpers'
import { ACTIVITY_FEED_CAP } from '../../../shared/constants'
import type { Session, ActivityEvent } from '../../../shared/types'

const HOUR = 60 * 60 * 1000
const MIN = 60 * 1000

// Pin "now" to mid-afternoon on a fixed local day so tests don't flake when
// the run crosses real wall-clock midnight (sessions ".N hours ago" need to
// stay within the same local day to clear the dayStart guard).
const FIXED_NOON = new Date(2026, 3, 14, 14, 0, 0, 0).getTime()

function dayStart(): number {
  const d = new Date(FIXED_NOON)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

describe('computeTimeline duration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOON)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses session.startedAt as firstTs, not events[0], so heavy sessions show real runtime', () => {
    const now = Date.now()
    // Session started 2h ago (still within today)
    const session = makeSession({ id: 's1', status: 'running', startedAt: now - 2 * HOUR })
    // Activity feed is at cap — oldest surviving event is only 20 min ago
    // (simulating heavy claude-code use that evicted older events)
    const events: ActivityEvent[] = Array.from({ length: ACTIVITY_FEED_CAP }, (_, i) =>
      makeActivityEvent({ timestamp: now - 20 * MIN + (i * (20 * MIN)) / ACTIVITY_FEED_CAP }),
    )
    const rows = computeTimeline({ [session.id]: session }, { [session.id]: events }, dayStart())
    expect(rows).toHaveLength(1)
    // Bug: current code reports ~20 min. Fix: should report ~2h.
    expect(rows[0]?.duration).toBe('2h 00m')
  })

  it('exited session duration spans from startedAt to last activity + grace', () => {
    const now = Date.now()
    // Session started 10 min ago, had two bursts of activity, then exited
    const startedAt = now - 10 * MIN
    const session: Session = makeSession({
      id: 's2',
      status: 'exited',
      startedAt,
    })
    // Agent took 5 minutes to emit its first activity event; last activity was 2 min ago
    const events = [
      makeActivityEvent({ timestamp: startedAt + 5 * MIN }),
      makeActivityEvent({ timestamp: now - 2 * MIN }),
    ]
    const rows = computeTimeline({ [session.id]: session }, { [session.id]: events }, dayStart())
    expect(rows).toHaveLength(1)
    // Bug: firstTs=events[0]=startedAt+5min → duration = (2min ago + 30s) - (5min into session)
    //   = ~3 min, rendered "0h 03m"
    // Fix: firstTs=startedAt → duration = (2min ago + 30s) - startedAt = ~8.5 min, "0h 08m"
    expect(rows[0]?.duration).toBe('0h 08m')
  })

  it('session no longer in store falls back to events[0] for firstTs (backwards compatible)', () => {
    const now = Date.now()
    const events = [
      makeActivityEvent({ timestamp: now - 90 * MIN }),
      makeActivityEvent({ timestamp: now - 5 * MIN }),
    ]
    const rows = computeTimeline({}, { 'ghost-session': events }, dayStart())
    expect(rows).toHaveLength(1)
    // No session in store → endTs = lastEvent + 30s; firstTs = events[0]
    expect(rows[0]?.duration).toBe('1h 25m')
  })
})
