import { useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import type { ActivityEvent, Session } from '../../shared/types'

export interface TimelineSegment {
  type: string
  widthPct: number
}

export interface TimelineRow {
  sessionId: string
  label: string
  segments: TimelineSegment[]
  duration: string
}

function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

export function computeTimeline(
  sessions: Record<string, Session>,
  activityFeeds: Record<string, ActivityEvent[]>,
): TimelineRow[] {
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const dayStart = midnight.getTime()
  const now = Date.now()
  const totalSpan = now - dayStart

  if (totalSpan <= 0) return []

  const rows: TimelineRow[] = []

  for (const [sessionId, session] of Object.entries(sessions)) {
    if (session.startedAt < dayStart - 86_400_000) continue // skip old sessions

    const feed = activityFeeds[sessionId]
    if (!feed || feed.length === 0) continue

    const segments: TimelineSegment[] = []
    const sorted = [...feed].sort((a, b) => a.timestamp - b.timestamp)

    for (let i = 0; i < sorted.length; i++) {
      const event = sorted[i]
      if (!event) continue
      const start = Math.max(event.timestamp, dayStart)
      const next = sorted[i + 1]
      const end = next ? Math.min(next.timestamp, now) : Math.min(event.timestamp + 30_000, now)

      const widthPct = ((end - start) / totalSpan) * 100
      if (widthPct > 0.1) {
        segments.push({ type: event.type, widthPct })
      }
    }

    if (segments.length > 0) {
      const firstTs = sorted[0]?.timestamp ?? Date.now()
      const lastTs = sorted[sorted.length - 1]?.timestamp ?? Date.now()
      const duration = formatDuration(lastTs - firstTs + 30_000)
      const agent = session.agentOverride ?? 'agent'

      rows.push({
        sessionId,
        label: agent,
        segments,
        duration,
      })
    }
  }

  return rows
}

export function useSessionTimeline(): TimelineRow[] {
  const sessions = useAppStore((s) => s.sessions)
  const activityFeeds = useAppStore((s) => s.activityFeeds)
  return useMemo(() => computeTimeline(sessions, activityFeeds), [sessions, activityFeeds])
}
