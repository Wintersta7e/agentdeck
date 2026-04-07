import type { DailyCostEntry } from '../shared/types'

export interface CostHistory {
  recordCost: (agentId: string, costUsd: number, tokens: number) => void
  getHistory: (days: number) => DailyCostEntry[]
  getBudget: () => number | null
  setBudget: (amount: number | null) => void
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export function createCostHistory(): CostHistory {
  const entries = new Map<string, DailyCostEntry>()
  let dailyBudget: number | null = null

  return {
    recordCost(agentId, costUsd, tokens) {
      const date = todayStr()
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
    },
  }
}
