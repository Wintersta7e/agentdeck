import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store/appStore'
import type { ActivityEvent, Session } from '../../shared/types'
import { useMidnight } from './useMidnight'
import { TIMELINE_EVENT_DURATION_MS, TIMELINE_MIN_SPAN_MS } from '../../shared/constants'

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

// Cache labels so closed sessions keep their agent + project name
const labelCache = new Map<string, string>()

export function computeTimeline(
  sessions: Record<string, Session>,
  activityFeeds: Record<string, ActivityEvent[]>,
  dayStart: number,
  projectMap?: Map<string, string>,
  _tick?: number, // unused value — forces recomputation when it changes
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

    // Anchor to session.startedAt because activityFeeds is a 500-event ring buffer —
    // events[0] is not the session start once the cap is hit.
    const firstTs = session ? Math.max(session.startedAt, dayStart) : (events[0]?.timestamp ?? now)
    const lastTs = events[events.length - 1]?.timestamp ?? now
    // Minimum span so very short sessions still show proportional segments
    const sessionSpan = Math.max(
      TIMELINE_MIN_SPAN_MS,
      lastTs + TIMELINE_EVENT_DURATION_MS - firstTs,
    )

    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      if (!event) continue
      const start = Math.max(event.timestamp, dayStart)
      const next = events[i + 1]
      const end = next
        ? Math.min(next.timestamp, now)
        : Math.min(event.timestamp + TIMELINE_EVENT_DURATION_MS, now)

      // H11: Guard against zero/negative-width segments (e.g. events spanning midnight)
      if (end <= start) continue

      const widthPct = ((end - start) / sessionSpan) * 100
      segments.push({ type: event.type, widthPct: Math.max(0.5, widthPct) })
    }

    if (segments.length > 0) {
      // For running sessions, use current time as end; for closed sessions, use last event
      const isRunning = session?.status === 'running' || session?.status === 'starting'
      const endTs = isRunning ? now : lastTs + TIMELINE_EVENT_DURATION_MS
      const duration = formatDuration(endTs - firstTs)
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
  const midnight = useMidnight()

  // Tick every 30s to keep duration fresh for running sessions
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  return useMemo(
    () => computeTimeline(sessions, activityFeeds, midnight, projectMap, tick),
    [sessions, activityFeeds, midnight, projectMap, tick],
  )
}
