import { useEffect, useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import type { DailyUsageEntry, Session } from '../../shared/types'
import { useMidnight } from './useMidnight'
import { isoKeyFromTs } from '../../shared/date-keys'
import { USAGE_REFRESH_INTERVAL_MS } from '../../shared/constants'

export interface TodayProductivity {
  sessions: number
  activeMs: number
  filesChanged: number
}

export interface ProductivityData extends TodayProductivity {
  history: DailyUsageEntry[]
}

interface TodayInput {
  usageHistory: DailyUsageEntry[]
  sessions: Record<string, Session>
  writeCounts: Record<string, number>
  midnight: number
  now: number
}

/**
 * Merge the persisted daily rollup with live in-flight sessions started today.
 * Persisted survives restart; live keeps today responsive before sessions end.
 */
export function computeTodayProductivity({
  usageHistory,
  sessions,
  writeCounts,
  midnight,
  now,
}: TodayInput): TodayProductivity {
  const today = usageHistory.find((e) => e.date === isoKeyFromTs(midnight))
  let sessionCount = today?.sessions ?? 0
  let activeMs = today?.activeMs ?? 0
  let filesChanged = today?.filesChanged ?? 0

  for (const [id, s] of Object.entries(sessions)) {
    if (s.startedAt < midnight) continue
    sessionCount += 1
    activeMs += Math.max(0, now - s.startedAt)
    filesChanged += writeCounts[id] ?? 0
  }

  return { sessions: sessionCount, activeMs, filesChanged }
}

export function useProductivity(): ProductivityData {
  const usageHistory = useAppStore((s) => s.usageHistory)
  const setUsageHistory = useAppStore((s) => s.setUsageHistory)
  const sessions = useAppStore((s) => s.sessions)
  const writeCounts = useAppStore((s) => s.writeCountBySession)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const history = await window.agentDeck.usage.getHistory(7)
        if (!cancelled) setUsageHistory(history)
      } catch {
        /* ignore IPC errors */
      }
    }
    void load()
    const interval = setInterval(() => void load(), USAGE_REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [setUsageHistory])

  const midnight = useMidnight()

  // `now` is captured once at render time. We do not want a re-render every ms;
  // the memo only needs to recompute when the persisted history or live sessions
  // change, or at day rollover (midnight changes via useMidnight).
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const today = useMemo(
    () => computeTodayProductivity({ usageHistory, sessions, writeCounts, midnight, now }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` is a render-time snapshot; adding it would re-run every render
    [usageHistory, sessions, writeCounts, midnight],
  )

  return { history: usageHistory, ...today }
}
