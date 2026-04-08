import { describe, it, expect } from 'vitest'
import { computeDailyDigest } from '../useDailyDigest'

const MIDNIGHT = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
})()

describe('computeDailyDigest', () => {
  it('returns zeroes and null cleanExitRate when no sessions', () => {
    const digest = computeDailyDigest({}, {}, 0, MIDNIGHT)
    expect(digest.sessionsToday).toBe(0)
    expect(digest.costToday).toBe(0)
    expect(digest.cleanExitRate).toBeNull()
    expect(digest.topAgent).toBe('')
  })

  it('counts sessions started today', () => {
    const now = Date.now()
    const sessions = {
      s1: { id: 's1', status: 'running', startedAt: now, agentOverride: 'claude-code' },
      s2: { id: 's2', status: 'exited', startedAt: MIDNIGHT - 1, agentOverride: 'codex' },
    }
    const digest = computeDailyDigest(sessions, {}, 0, MIDNIGHT)
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
    const digest = computeDailyDigest(sessions, {}, 0, MIDNIGHT)
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
    const digest = computeDailyDigest(sessions, usage, 0, MIDNIGHT)
    expect(digest.costToday).toBeCloseTo(3.8)
  })

  it('passes filesChanged through as-is', () => {
    const now = Date.now()
    const sessions = { s1: { id: 's1', status: 'running', startedAt: now } }
    const digest = computeDailyDigest(sessions, {}, 2, MIDNIGHT)
    expect(digest.filesChanged).toBe(2)
  })
})
