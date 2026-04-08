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

// Cache labels so closed sessions keep their agent + project name
const labelCache = new Map<string, string>()

export function computeTimeline(
  sessions: Record<string, Session>,
  activityFeeds: Record<string, ActivityEvent[]>,
  dayStart: number,
  projectMap?: Map<string, string>,
): TimelineRow[] {
  const now = Date.now()

  if (now <= dayStart) return []

  const rows: TimelineRow[] = []

  // Iterate activityFeeds (not sessions) so closed sessions still appear in the timeline
  for (const [sessionId, feed] of Object.entries(activityFeeds)) {
    if (!feed || feed.length === 0) continue

    const session = sessions[sessionId]
    // If session still exists, check it started today. If removed, check feed timestamps.
    if (session && session.startedAt < dayStart) continue
    if (!session && feed[0] && feed[0].timestamp < dayStart) continue

    const segments: TimelineSegment[] = []
    const events = feed

    // Use session's active span (first event → now) for proportional widths,
    // not the full day span — otherwise short sessions produce invisible segments
    const firstTs = events[0]?.timestamp ?? now
    const lastTs = events[events.length - 1]?.timestamp ?? now
    // Minimum 60s span so very short sessions still show proportional segments
    const sessionSpan = Math.max(60_000, lastTs + 30_000 - firstTs)

    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      if (!event) continue
      const start = Math.max(event.timestamp, dayStart)
      const next = events[i + 1]
      const end = next ? Math.min(next.timestamp, now) : Math.min(event.timestamp + 30_000, now)

      // H11: Guard against zero/negative-width segments (e.g. events spanning midnight)
      if (end <= start) continue

      const widthPct = ((end - start) / sessionSpan) * 100
      segments.push({ type: event.type, widthPct: Math.max(0.5, widthPct) })
    }

    if (segments.length > 0) {
      const duration = formatDuration(lastTs - firstTs + 30_000)
      // Build label from live session data, or use cached label for closed sessions
      let label = labelCache.get(sessionId)
      if (!label && session) {
        const projectName = session.projectId ? projectMap?.get(session.projectId) : undefined
        label = projectName ?? 'session'
        labelCache.set(sessionId, label)
      }

      rows.push({
        sessionId,
        label: label ?? 'session',
        segments,
        duration,
      })
    }
  }

  return rows
}

export function useSessionTimeline(): TimelineRow[] {
  const sessions = useAppStore((s) => s.sessions)
  const projects = useAppStore((s) => s.projects)
  // NOTE: This hook legitimately needs the full feed data for timeline computation.
  // The re-render cost is acceptable — the timeline is in a collapsible Tier 3
  // section (SessionTimeline) and only mounts when expanded.
  const activityFeeds = useAppStore((s) => s.activityFeeds)

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects])

  // Eagerly cache labels while sessions are still alive — before removeSession deletes them
  useEffect(() => {
    for (const [sessionId, session] of Object.entries(sessions)) {
      if (!labelCache.has(sessionId)) {
        const projectName = session.projectId ? projectMap.get(session.projectId) : undefined
        if (projectName) {
          labelCache.set(sessionId, projectName)
        }
      }
    }
  }, [sessions, projectMap])

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
    () => computeTimeline(sessions, activityFeeds, midnight, projectMap),
    [sessions, activityFeeds, midnight, projectMap],
  )
}
