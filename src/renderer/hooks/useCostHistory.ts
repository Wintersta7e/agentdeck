import { useEffect, useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import { getDefaultAgent } from '../../shared/agent-helpers'
import type { DailyCostEntry, Project, Session } from '../../shared/types'
import { useMidnight } from './useMidnight'
import { COST_REFRESH_INTERVAL_MS } from '../../shared/constants'

export interface CostDashboardData {
  history: DailyCostEntry[]
  budget: number | null
  todayCost: number
  perAgentToday: Record<string, number>
}

interface SessionUsageTotals {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalCostUsd: number
}

/** Today's ISO date key, matching the format used by CostHistory on disk. */
function todayIsoKey(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Compute today's total cost and per-agent breakdown, merging live in-memory
 * session usage with the disk-persisted daily aggregate. The persisted entry
 * survives app restarts; live usage reflects current-session spending before
 * the next IPC refresh. Taking the max keeps both sources responsive.
 */
export function computeTodayTotals(
  sessionUsage: Record<string, SessionUsageTotals>,
  sessions: Record<string, Session>,
  projects: Project[],
  costHistory: DailyCostEntry[],
  midnight: number,
): { todayCost: number; perAgentToday: Record<string, number> } {
  let liveTotal = 0
  const livePerAgent: Record<string, number> = {}
  const projectMap = new Map(projects.map((p) => [p.id, p]))
  for (const [sessionId, usage] of Object.entries(sessionUsage)) {
    const session = sessions[sessionId]
    if (session && session.startedAt < midnight) continue
    liveTotal += usage.totalCostUsd
    const project = session?.projectId ? projectMap.get(session.projectId) : undefined
    const defaultAgent = project ? getDefaultAgent(project) : undefined
    const agent = session?.agentOverride ?? defaultAgent?.agent ?? 'claude-code'
    livePerAgent[agent] = (livePerAgent[agent] ?? 0) + usage.totalCostUsd
  }

  const todayEntry = costHistory.find((e) => e.date === todayIsoKey())
  const persistedTotal = todayEntry?.totalCostUsd ?? 0
  const persistedPerAgent = todayEntry?.perAgent ?? {}

  const todayCost = Math.max(liveTotal, persistedTotal)
  const perAgentToday: Record<string, number> = {}
  const agentKeys = new Set([...Object.keys(livePerAgent), ...Object.keys(persistedPerAgent)])
  for (const agent of agentKeys) {
    perAgentToday[agent] = Math.max(livePerAgent[agent] ?? 0, persistedPerAgent[agent] ?? 0)
  }

  return { todayCost, perAgentToday }
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

  const { todayCost, perAgentToday } = useMemo(
    () => computeTodayTotals(sessionUsage, sessions, projects, costHistory, midnight),
    [sessionUsage, sessions, projects, costHistory, midnight],
  )

  return { history: costHistory, budget: dailyBudget, todayCost, perAgentToday }
}
