import { useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import { getDefaultAgent } from '../../shared/agent-helpers'
import { useMidnight } from './useMidnight'

export interface DailyDigestData {
  sessionsToday: number
  filesChanged: number
  costToday: number
  cleanExitRate: number | null
  topAgent: string
}

/** Pure computation — exported for testing */
export function computeDailyDigest(
  sessions: Record<
    string,
    { id: string; status: string; startedAt: number; agentOverride?: string | undefined }
  >,
  sessionUsage: Record<string, { totalCostUsd: number }>,
  filesChanged: number,
  midnight: number,
): DailyDigestData {
  const todaySessions = Object.values(sessions).filter((s) => s.startedAt >= midnight)

  let costToday = 0
  const agentCounts: Record<string, number> = {}
  let exitCount = 0
  let errorCount = 0

  for (const s of todaySessions) {
    const usage = sessionUsage[s.id]
    if (usage?.totalCostUsd) costToday += usage.totalCostUsd

    const agent = s.agentOverride ?? 'session'
    agentCounts[agent] = (agentCounts[agent] ?? 0) + 1

    if (s.status === 'exited') exitCount++
    if (s.status === 'error') errorCount++
  }

  const total = exitCount + errorCount
  const cleanExitRate = total > 0 ? (exitCount / total) * 100 : null

  let topAgent = ''
  let topCount = 0
  for (const [agent, count] of Object.entries(agentCounts)) {
    if (count > topCount) {
      topAgent = agent
      topCount = count
    }
  }

  return {
    sessionsToday: todaySessions.length,
    filesChanged,
    costToday,
    cleanExitRate,
    topAgent,
  }
}

export function useDailyDigest(): DailyDigestData {
  const sessions = useAppStore((s) => s.sessions)
  const projects = useAppStore((s) => s.projects)
  const sessionUsage = useAppStore((s) => s.sessionUsage)

  // Resolve actual agent names (agentOverride is empty for project-default agents)
  const resolvedSessions = useMemo(() => {
    const projectMap = new Map(projects.map((p) => [p.id, p]))
    const result: Record<
      string,
      { id: string; status: string; startedAt: number; agentOverride?: string | undefined }
    > = {}
    for (const [id, s] of Object.entries(sessions)) {
      const project = s.projectId ? projectMap.get(s.projectId) : undefined
      const defaultAgent = project ? getDefaultAgent(project) : undefined
      result[id] = {
        ...s,
        agentOverride: s.agentOverride ?? defaultAgent?.agent,
      }
    }
    return result
  }, [sessions, projects])
  // Write counter is maintained by the store. Iterates N sessions (not events)
  // and only changes when a 'write' event fires — cheaper than scanning feeds.
  const writeCount = useAppStore((s) => {
    let count = 0
    for (const c of Object.values(s.writeCountBySession)) count += c
    return count
  })

  // H14: Reactive midnight boundary — recomputes at day rollover
  const midnight = useMidnight()

  return useMemo(
    () => computeDailyDigest(resolvedSessions, sessionUsage, writeCount, midnight),
    [resolvedSessions, sessionUsage, writeCount, midnight],
  )
}
