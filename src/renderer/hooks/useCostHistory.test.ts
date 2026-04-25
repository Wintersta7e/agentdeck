import { describe, it, expect } from 'vitest'
import { computeTodayTotals } from './useCostHistory'
import { makeProject, makeSession, makeTokenUsage } from '../../__test__/helpers'
import { todayIsoKey, isoKeyFromTs } from '../../shared/date-keys'
import type { DailyCostEntry } from '../../shared/types'

const MIDNIGHT = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
})()

function makeEntry(overrides: Partial<DailyCostEntry> = {}): DailyCostEntry {
  return {
    date: todayIsoKey(),
    totalCostUsd: 0,
    perAgent: {},
    sessionCount: 0,
    tokenCount: 0,
    ...overrides,
  }
}

describe('computeTodayTotals', () => {
  it('falls back to disk-persisted costHistory when sessionUsage is empty (app restart)', () => {
    const totals = computeTodayTotals({
      sessionUsage: {},
      sessions: {},
      projects: [],
      costHistory: [makeEntry({ totalCostUsd: 2.5, perAgent: { 'claude-code': 2.0, codex: 0.5 } })],
      midnight: MIDNIGHT,
    })
    expect(totals.todayCost).toBe(2.5)
    expect(totals.perAgentToday).toEqual({ 'claude-code': 2.0, codex: 0.5 })
  })

  it('uses live sessionUsage sum when it exceeds persisted history (in-flight usage)', () => {
    const session = makeSession({ id: 's1', agentOverride: 'claude-code' })
    const totals = computeTodayTotals({
      sessionUsage: { s1: makeTokenUsage({ totalCostUsd: 3.0 }) },
      sessions: { s1: session },
      projects: [makeProject({ id: 'proj-1' })],
      costHistory: [makeEntry({ totalCostUsd: 2.0, perAgent: { 'claude-code': 2.0 } })],
      midnight: MIDNIGHT,
    })
    expect(totals.todayCost).toBe(3.0)
    expect(totals.perAgentToday['claude-code']).toBe(3.0)
  })

  it('takes max per agent when live and persisted disagree', () => {
    const session = makeSession({ id: 's1', agentOverride: 'codex' })
    const totals = computeTodayTotals({
      sessionUsage: { s1: makeTokenUsage({ totalCostUsd: 0.5 }) },
      sessions: { s1: session },
      projects: [makeProject({ id: 'proj-1' })],
      costHistory: [makeEntry({ totalCostUsd: 1.5, perAgent: { 'claude-code': 1.0, codex: 0.5 } })],
      midnight: MIDNIGHT,
    })
    expect(totals.perAgentToday).toEqual({ 'claude-code': 1.0, codex: 0.5 })
    expect(totals.todayCost).toBe(1.5)
  })

  it('ignores yesterday entries in costHistory', () => {
    const yesterday = isoKeyFromTs(MIDNIGHT - 86_400_000)
    const totals = computeTodayTotals({
      sessionUsage: {},
      sessions: {},
      projects: [],
      costHistory: [
        makeEntry({ date: yesterday, totalCostUsd: 10.0, perAgent: { 'claude-code': 10.0 } }),
      ],
      midnight: MIDNIGHT,
    })
    expect(totals.todayCost).toBe(0)
    expect(totals.perAgentToday).toEqual({})
  })

  it('skips sessions whose startedAt is before midnight (pre-existing filter)', () => {
    const session = makeSession({
      id: 's-old',
      startedAt: MIDNIGHT - 1000,
      agentOverride: 'claude-code',
    })
    const totals = computeTodayTotals({
      sessionUsage: { 's-old': makeTokenUsage({ totalCostUsd: 5.0 }) },
      sessions: { 's-old': session },
      projects: [makeProject({ id: 'proj-1' })],
      costHistory: [],
      midnight: MIDNIGHT,
    })
    expect(totals.todayCost).toBe(0)
  })
})
