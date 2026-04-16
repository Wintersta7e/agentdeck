import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCostHistory } from '../cost-history'
import { todayIsoKey } from '../../shared/date-keys'

describe('CostHistory', () => {
  let history: ReturnType<typeof createCostHistory>

  beforeEach(() => {
    // No storePath — pure in-memory mode for tests
    history = createCostHistory()
  })

  it('records a cost entry for today', () => {
    const today = todayIsoKey()
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

describe('CostHistory persistence', () => {
  let tmpDir: string
  let storePath: string

  beforeEach(() => {
    vi.useFakeTimers()
    tmpDir = mkdtempSync(join(tmpdir(), 'costhist-'))
    storePath = join(tmpDir, 'cost-history.json')
  })

  afterEach(() => {
    vi.useRealTimers()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('flush() writes pending changes synchronously for shutdown paths', () => {
    const history = createCostHistory(storePath)
    history.recordCost('claude-code', 0.75, 12000)
    // Debounce hasn't fired yet
    expect(existsSync(storePath)).toBe(false)
    history.flush()
    expect(existsSync(storePath)).toBe(true)
    const saved = JSON.parse(readFileSync(storePath, 'utf-8')) as {
      entries: Array<{ totalCostUsd: number }>
    }
    expect(saved.entries).toHaveLength(1)
    expect(saved.entries[0]?.totalCostUsd).toBeCloseTo(0.75, 8)
  })

  it('coalesces multiple recordCost calls into a single debounced write', async () => {
    const history = createCostHistory(storePath)
    history.recordCost('claude-code', 0.1, 1000)
    history.recordCost('claude-code', 0.2, 2000)
    history.recordCost('codex', 0.3, 3000)
    await vi.advanceTimersByTimeAsync(5_000)
    // Drain the microtask queue so the async fs.writeFile resolves
    await Promise.resolve()
    await vi.runAllTimersAsync()
    expect(existsSync(storePath)).toBe(true)
  })

  it('reloads persisted entries from disk on next construction', () => {
    const first = createCostHistory(storePath)
    first.recordCost('claude-code', 1.25, 5000)
    first.setBudget(42)
    first.flush()

    const second = createCostHistory(storePath)
    expect(second.getBudget()).toBe(42)
    expect(second.getHistory(7)[0]?.totalCostUsd).toBeCloseTo(1.25, 8)
  })
})
