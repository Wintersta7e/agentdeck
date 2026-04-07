import { useState, useEffect, useMemo } from 'react'
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

function getMidnight(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function computeTimeline(
  sessions: Record<string, Session>,
  activityFeeds: Record<string, ActivityEvent[]>,
  dayStart: number,
): TimelineRow[] {
  const now = Date.now()
  const totalSpan = now - dayStart

  if (totalSpan <= 0) return []

  const rows: TimelineRow[] = []

  for (const [sessionId, session] of Object.entries(sessions)) {
    // H11: Only include sessions that started today — exclude yesterday's sessions entirely
    if (session.startedAt < dayStart) continue

    const feed = activityFeeds[sessionId]
    if (!feed || feed.length === 0) continue

    const segments: TimelineSegment[] = []
    // Activity events are appended in chronological order by addActivityEvent
    const events = feed

    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      if (!event) continue
      const start = Math.max(event.timestamp, dayStart)
      const next = events[i + 1]
      const end = next ? Math.min(next.timestamp, now) : Math.min(event.timestamp + 30_000, now)

      // H11: Guard against zero/negative-width segments (e.g. events spanning midnight)
      if (end <= start) continue

      const widthPct = ((end - start) / totalSpan) * 100
      if (widthPct > 0.1) {
        segments.push({ type: event.type, widthPct })
      }
    }

    if (segments.length > 0) {
      const firstTs = events[0]?.timestamp ?? Date.now()
      const lastTs = events[events.length - 1]?.timestamp ?? Date.now()
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
  // NOTE: This hook legitimately needs the full feed data for timeline computation.
  // The re-render cost is acceptable — the timeline is in a collapsible Tier 3
  // section (SessionTimeline) and only mounts when expanded.
  const activityFeeds = useAppStore((s) => s.activityFeeds)

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
    () => computeTimeline(sessions, activityFeeds, midnight),
    [sessions, activityFeeds, midnight],
  )
}
