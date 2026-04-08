import { useEffect, useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import { getDefaultAgent } from '../../shared/agent-helpers'
import type { DailyCostEntry } from '../../shared/types'
import { useMidnight } from './useMidnight'
import { COST_REFRESH_INTERVAL_MS } from '../../shared/constants'

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
  const projects = useAppStore((s) => s.projects)

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
    // Refresh cost history periodically while the home screen is visible
    const interval = setInterval(() => void load(), COST_REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [setCostHistory, setDailyBudget])

  // H14: Reactive midnight boundary — recomputes at day rollover
  const midnight = useMidnight()

  const { todayCost, perAgentToday } = useMemo(() => {
    let total = 0
    const perAgent: Record<string, number> = {}

    const projectMap = new Map(projects.map((p) => [p.id, p]))
    for (const [sessionId, usage] of Object.entries(sessionUsage)) {
      const session = sessions[sessionId]
      // If session still exists, check it started today. If already closed/removed,
      // keep its cost — all in-memory sessionUsage is from this app session.
      if (session && session.startedAt < midnight) continue
      total += usage.totalCostUsd
      const project = session?.projectId ? projectMap.get(session.projectId) : undefined
      const defaultAgent = project ? getDefaultAgent(project) : undefined
      const agent = session?.agentOverride ?? defaultAgent?.agent ?? 'claude-code'
      perAgent[agent] = (perAgent[agent] ?? 0) + usage.totalCostUsd
    }

    return { todayCost: total, perAgentToday: perAgent }
  }, [sessionUsage, sessions, projects, midnight])

  return { history: costHistory, budget: dailyBudget, todayCost, perAgentToday }
}
