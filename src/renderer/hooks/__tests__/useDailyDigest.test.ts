import { describe, it, expect } from 'vitest'
import { computeDailyDigest } from '../useDailyDigest'

describe('computeDailyDigest', () => {
  it('returns zeroes when no sessions', () => {
    const digest = computeDailyDigest({}, {}, {})
    expect(digest.sessionsToday).toBe(0)
    expect(digest.costToday).toBe(0)
    expect(digest.cleanExitRate).toBe(0)
    expect(digest.topAgent).toBe('')
  })

  it('counts sessions started today', () => {
    const now = Date.now()
    const sessions = {
      s1: { id: 's1', status: 'running', startedAt: now, agentOverride: 'claude-code' },
      s2: { id: 's2', status: 'exited', startedAt: now - 86_400_001, agentOverride: 'codex' },
    }
    const digest = computeDailyDigest(sessions, {}, {})
    expect(digest.sessionsToday).toBe(1)
    expect(digest.topAgent).toBe('claude-code')
  })

  it('computes clean exit rate', () => {
    const now = Date.now()
    const sessions = {
      s1: { id: 's1', status: 'exited', startedAt: now },
      s2: { id: 's2', status: 'exited', startedAt: now },
      s3: { id: 's3', status: 'error', startedAt: now },
    }
    const digest = computeDailyDigest(sessions, {}, {})
    expect(digest.cleanExitRate).toBeCloseTo(67, 0)
  })

  it('sums cost from sessionUsage', () => {
    const now = Date.now()
    const sessions = {
      s1: { id: 's1', status: 'running', startedAt: now },
      s2: { id: 's2', status: 'running', startedAt: now },
    }
    const usage = {
      s1: { totalCostUsd: 1.5 },
      s2: { totalCostUsd: 2.3 },
    }
    const digest = computeDailyDigest(sessions, usage, {})
    expect(digest.costToday).toBeCloseTo(3.8)
  })

  it('counts write activities as files changed', () => {
    const now = Date.now()
    const sessions = { s1: { id: 's1', status: 'running', startedAt: now } }
    const feeds = {
      s1: [{ type: 'write' }, { type: 'read' }, { type: 'write' }, { type: 'think' }],
    }
    const digest = computeDailyDigest(sessions, {}, feeds)
    expect(digest.filesChanged).toBe(2)
  })
})
