import { useMemo } from 'react'
import { useAppStore } from '../store/appStore'

export interface DailyDigestData {
  sessionsToday: number
  filesChanged: number
  costToday: number
  cleanExitRate: number
  topAgent: string
}

function midnightToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Pure computation — exported for testing */
export function computeDailyDigest(
  sessions: Record<
    string,
    { id: string; status: string; startedAt: number; agentOverride?: string | undefined }
  >,
  sessionUsage: Record<string, { totalCostUsd: number }>,
  activityFeeds: Record<string, Array<{ type: string }>>,
): DailyDigestData {
  const midnight = midnightToday()
  const todaySessions = Object.values(sessions).filter((s) => s.startedAt >= midnight)

  let costToday = 0
  let filesChanged = 0
  const agentCounts: Record<string, number> = {}
  let exitCount = 0
  let errorCount = 0

  for (const s of todaySessions) {
    const usage = sessionUsage[s.id]
    if (usage?.totalCostUsd) costToday += usage.totalCostUsd

    const feed = activityFeeds[s.id]
    if (feed) filesChanged += feed.filter((a) => a.type === 'write').length

    const agent = s.agentOverride ?? 'unknown'
    agentCounts[agent] = (agentCounts[agent] ?? 0) + 1

    if (s.status === 'exited') exitCount++
    if (s.status === 'error') errorCount++
  }

  const total = exitCount + errorCount
  const cleanExitRate = total > 0 ? (exitCount / total) * 100 : 0

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
  const sessionUsage = useAppStore((s) => s.sessionUsage)
  const activityFeeds = useAppStore((s) => s.activityFeeds)

  return useMemo(
    () => computeDailyDigest(sessions, sessionUsage, activityFeeds),
    [sessions, sessionUsage, activityFeeds],
  )
}
