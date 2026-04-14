import { describe, it, expect } from 'vitest'
import { computeTodayTotals } from '../useCostHistory'
import type { DailyCostEntry, Project, Session } from '../../../shared/types'

const MIDNIGHT = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
})()

const TODAY_KEY = new Date().toISOString().slice(0, 10)

function makeProject(overrides: Partial<Project> = {}): Project {
  return { id: 'proj-1', name: 'P', path: '/tmp', ...overrides }
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return { id: 's1', projectId: 'proj-1', status: 'running', startedAt: Date.now(), ...overrides }
}

function makeEntry(overrides: Partial<DailyCostEntry> = {}): DailyCostEntry {
  return {
    date: TODAY_KEY,
    totalCostUsd: 0,
    perAgent: {},
    sessionCount: 0,
    tokenCount: 0,
    ...overrides,
  }
}

describe('computeTodayTotals', () => {
  it('falls back to disk-persisted costHistory when sessionUsage is empty (app restart)', () => {
    const totals = computeTodayTotals(
      {},
      {},
      [],
      [makeEntry({ totalCostUsd: 2.5, perAgent: { 'claude-code': 2.0, codex: 0.5 } })],
      MIDNIGHT,
    )
    expect(totals.todayCost).toBe(2.5)
    expect(totals.perAgentToday).toEqual({ 'claude-code': 2.0, codex: 0.5 })
  })

  it('uses live sessionUsage sum when it exceeds persisted history (in-flight usage)', () => {
    const session = makeSession({ id: 's1', agentOverride: 'claude-code' })
    const totals = computeTodayTotals(
      {
        s1: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalCostUsd: 3.0,
        },
      },
      { s1: session },
      [makeProject()],
      [makeEntry({ totalCostUsd: 2.0, perAgent: { 'claude-code': 2.0 } })],
      MIDNIGHT,
    )
    // Live > persisted → show live (more responsive)
    expect(totals.todayCost).toBe(3.0)
    expect(totals.perAgentToday['claude-code']).toBe(3.0)
  })

  it('takes max per agent when live and persisted disagree', () => {
    const session = makeSession({ id: 's1', agentOverride: 'codex' })
    const totals = computeTodayTotals(
      {
        s1: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalCostUsd: 0.5,
        },
      },
      { s1: session },
      [makeProject()],
      [makeEntry({ totalCostUsd: 1.5, perAgent: { 'claude-code': 1.0, codex: 0.5 } })],
      MIDNIGHT,
    )
    // live codex = 0.5; persisted codex = 0.5 → 0.5
    // live claude-code absent; persisted claude-code = 1.0 → 1.0
    expect(totals.perAgentToday).toEqual({ 'claude-code': 1.0, codex: 0.5 })
    // Total = max(live sum 0.5, persisted 1.5) = 1.5
    expect(totals.todayCost).toBe(1.5)
  })

  it('ignores yesterday entries in costHistory', () => {
    const yesterday = new Date(MIDNIGHT - 86_400_000).toISOString().slice(0, 10)
    const totals = computeTodayTotals(
      {},
      {},
      [],
      [makeEntry({ date: yesterday, totalCostUsd: 10.0, perAgent: { 'claude-code': 10.0 } })],
      MIDNIGHT,
    )
    expect(totals.todayCost).toBe(0)
    expect(totals.perAgentToday).toEqual({})
  })

  it('skips sessions whose startedAt is before midnight (pre-existing filter)', () => {
    const session = makeSession({
      id: 's-old',
      startedAt: MIDNIGHT - 1000, // yesterday
      agentOverride: 'claude-code',
    })
    const totals = computeTodayTotals(
      {
        's-old': {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalCostUsd: 5.0,
        },
      },
      { 's-old': session },
      [makeProject()],
      [], // no persisted history
      MIDNIGHT,
    )
    expect(totals.todayCost).toBe(0)
  })
})
