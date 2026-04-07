import { useEffect, useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import type { DailyCostEntry } from '../../shared/types'

export interface CostDashboardData {
  history: DailyCostEntry[]
  budget: number | null
  todayCost: number
  perAgentToday: Record<string, number>
}

export function useCostHistory(): CostDashboardData {
  const costHistory = useAppStore((s) => s.costHistory)
  const setCostHistory = useAppStore((s) => s.setCostHistory)
  const dailyBudget = useAppStore((s) => s.dailyBudget)
  const setDailyBudget = useAppStore((s) => s.setDailyBudget)
  const sessionUsage = useAppStore((s) => s.sessionUsage)
  const sessions = useAppStore((s) => s.sessions)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const [history, budget] = await Promise.all([
          window.agentDeck.home.costHistory(7),
          window.agentDeck.home.getBudget(),
        ])
        if (!cancelled) {
          setCostHistory(history)
          if (budget !== null) setDailyBudget(budget)
        }
      } catch {
        // Ignore IPC errors
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [setCostHistory, setDailyBudget])

  const { todayCost, perAgentToday } = useMemo(() => {
    let total = 0
    const perAgent: Record<string, number> = {}

    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    const dayStart = midnight.getTime()

    for (const [sessionId, usage] of Object.entries(sessionUsage)) {
      const session = sessions[sessionId]
      if (!session || session.startedAt < dayStart) continue
      total += usage.totalCostUsd
      const agent = session.agentOverride ?? 'unknown'
      perAgent[agent] = (perAgent[agent] ?? 0) + usage.totalCostUsd
    }

    return { todayCost: total, perAgentToday: perAgent }
  }, [sessionUsage, sessions])

  return { history: costHistory, budget: dailyBudget, todayCost, perAgentToday }
}
