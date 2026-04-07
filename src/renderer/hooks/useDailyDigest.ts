import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '../store/appStore'

export interface DailyDigestData {
  sessionsToday: number
  filesChanged: number
  costToday: number
  cleanExitRate: number | null
  topAgent: string
}

function getMidnight(): number {
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

    const agent = s.agentOverride ?? 'unknown'
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
  const sessionUsage = useAppStore((s) => s.sessionUsage)
  // Narrow selector: compute total write count inline and return a primitive.
  // This avoids subscribing to the full activityFeeds map reference, which would
  // trigger re-renders for every session's feed update across all sessions.
  const writeCount = useAppStore((s) => {
    let count = 0
    for (const feed of Object.values(s.activityFeeds)) {
      for (const e of feed) {
        if (e.type === 'write') count++
      }
    }
    return count
  })

  // H14: Reactive midnight boundary — recomputes at day rollover
  const [midnight, setMidnight] = useState(getMidnight)
  useEffect(() => {
    const nextMidnight = midnight + 86_400_000
    // Use Math.max(0, ...) so the timer fires ASAP if we're already past midnight
    const ms = Math.max(0, nextMidnight - Date.now())
    const id = setTimeout(() => setMidnight(getMidnight()), ms)
    return () => clearTimeout(id)
  }, [midnight])

  return useMemo(
    () => computeDailyDigest(sessions, sessionUsage, writeCount, midnight),
    [sessions, sessionUsage, writeCount, midnight],
  )
}
