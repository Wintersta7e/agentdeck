import { describe, it, expect, beforeEach } from 'vitest'
import { createCostHistory } from '../cost-history'

describe('CostHistory', () => {
  let history: ReturnType<typeof createCostHistory>

  beforeEach(() => {
    // No storePath — pure in-memory mode for tests
    history = createCostHistory()
  })

  it('records a cost entry for today', () => {
    const today = new Date().toISOString().slice(0, 10)
    history.recordCost('claude-code', 1.5, 50000)

    const entries = history.getHistory(7)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.date).toBe(today)
    expect(entries[0]?.totalCostUsd).toBe(1.5)
    expect(entries[0]?.perAgent['claude-code']).toBe(1.5)
    expect(entries[0]?.sessionCount).toBe(1)
    expect(entries[0]?.tokenCount).toBe(50000)
  })

  it('accumulates costs for the same day and agent', () => {
    history.recordCost('claude-code', 1.0, 30000)
    history.recordCost('claude-code', 0.5, 20000)

    const entries = history.getHistory(7)
    expect(entries[0]?.totalCostUsd).toBe(1.5)
    expect(entries[0]?.perAgent['claude-code']).toBe(1.5)
    expect(entries[0]?.sessionCount).toBe(2)
    expect(entries[0]?.tokenCount).toBe(50000)
  })

  it('tracks multiple agents separately', () => {
    history.recordCost('claude-code', 2.0, 60000)
    history.recordCost('codex', 1.0, 30000)

    const entries = history.getHistory(7)
    expect(entries[0]?.totalCostUsd).toBe(3.0)
    expect(entries[0]?.perAgent['claude-code']).toBe(2.0)
    expect(entries[0]?.perAgent['codex']).toBe(1.0)
  })

  it('returns budget', () => {
    expect(history.getBudget()).toBeNull()
    history.setBudget(12.5)
    expect(history.getBudget()).toBe(12.5)
  })
})
