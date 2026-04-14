import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import type { DailyCostEntry } from '../shared/types'
import { todayIsoKey } from '../shared/date-keys'

export interface CostHistory {
  recordCost: (agentId: string, costUsd: number, tokens: number) => void
  getHistory: (days: number) => DailyCostEntry[]
  getBudget: () => number | null
  setBudget: (amount: number | null) => void
  flush: () => void
}

interface PersistedData {
  entries: DailyCostEntry[]
  budget: number | null
}

function loadFromDisk(storePath: string): {
  entries: Map<string, DailyCostEntry>
  budget: number | null
} {
  try {
    if (!existsSync(storePath)) return { entries: new Map(), budget: null }
    const raw = readFileSync(storePath, 'utf-8')
    const data = JSON.parse(raw) as PersistedData
    const entries = new Map<string, DailyCostEntry>((data.entries ?? []).map((e) => [e.date, e]))
    return { entries, budget: data.budget ?? null }
  } catch {
    return { entries: new Map(), budget: null }
  }
}

export function createCostHistory(storePath?: string): CostHistory {
  const { entries, budget: savedBudget } = storePath
    ? loadFromDisk(storePath)
    : { entries: new Map<string, DailyCostEntry>(), budget: null }
  let dailyBudget: number | null = savedBudget

  let flushTimer: ReturnType<typeof setTimeout> | null = null

  function schedulFlush(): void {
    if (!storePath) return
    if (flushTimer !== null) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      writeToDisk()
    }, 5_000)
  }

  function writeToDisk(): void {
    if (!storePath) return
    try {
      const data: PersistedData = {
        entries: Array.from(entries.values()),
        budget: dailyBudget,
      }
      writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch {
      // best-effort — ignore disk errors
    }
  }

  return {
    recordCost(agentId, costUsd, tokens) {
      const date = todayIsoKey()
      const existing = entries.get(date)
      if (existing) {
        existing.totalCostUsd += costUsd
        existing.perAgent[agentId] = (existing.perAgent[agentId] ?? 0) + costUsd
        existing.sessionCount += 1
        existing.tokenCount += tokens
      } else {
        entries.set(date, {
          date,
          totalCostUsd: costUsd,
          perAgent: { [agentId]: costUsd },
          sessionCount: 1,
          tokenCount: tokens,
        })
      }
      schedulFlush()
    },

    getHistory(days) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - days)
      const cutoffStr = cutoff.toISOString().slice(0, 10)

      return Array.from(entries.values())
        .filter((e) => e.date >= cutoffStr)
        .sort((a, b) => a.date.localeCompare(b.date))
    },

    getBudget() {
      return dailyBudget
    },

    setBudget(amount) {
      dailyBudget = amount
      schedulFlush()
    },

    flush() {
      if (flushTimer !== null) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      writeToDisk()
    },
  }
}
