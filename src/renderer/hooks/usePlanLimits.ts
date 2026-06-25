import { useCallback, useState } from 'react'
import { useAppStore } from '../store/appStore'
import type { CodexLimits, PlanWindow, Project, Session } from '../../shared/types'
import { USAGE_REFRESH_INTERVAL_MS } from '../../shared/constants'
import { resolveSessionAgent } from '../utils/resolve-session-agent'
import { usePollEffect } from './usePollEffect'

export interface ResolvedWindow {
  usedPercent: number
  windowMinutes: number
  resetsAt: number
  resetsInSec: number
}

export interface ActivityWindow {
  sessions: number
  activeMs: number
}

export interface AgentActivity extends ActivityWindow {
  agent: string
}

const FIVE_HOURS_MS = 5 * 3_600_000

/** Apply reset logic: if resets_at has passed, the window is effectively 0%. */
export function resolveWindow(w: PlanWindow | null, now: number): ResolvedWindow | null {
  if (!w) return null
  const resetsInSec = Math.max(0, w.resetsAt - Math.floor(now / 1000))
  const used = resetsInSec === 0 ? 0 : w.usedPercent
  return { usedPercent: used, windowMinutes: w.windowMinutes, resetsAt: w.resetsAt, resetsInSec }
}

/** Honest fallback for agents without limit data: activity in the last 5h. */
export function computeActivityWindow({
  sessions,
  now,
}: {
  sessions: Record<string, Session>
  now: number
}): ActivityWindow {
  const cutoff = now - FIVE_HOURS_MS
  let count = 0
  let activeMs = 0
  for (const s of Object.values(sessions)) {
    if (s.startedAt < cutoff) continue
    count += 1
    // Only live sessions have a measurable elapsed time; exited sessions don't
    // record an end time in the store, so `now - startedAt` would overstate them.
    if (s.status === 'running' || s.status === 'starting') {
      activeMs += Math.max(0, now - s.startedAt)
    }
  }
  return { sessions: count, activeMs }
}

/**
 * Per-agent rolling-5h activity, for every agent with >=1 session started in the window.
 * Sorted by activeMs desc, then sessions desc, then agent id.
 */
export function computeAgentActivity(
  sessions: Record<string, Session>,
  projects: Project[],
  now: number,
): AgentActivity[] {
  const byAgent: Record<string, Record<string, Session>> = {}
  for (const [id, s] of Object.entries(sessions)) {
    const agent = resolveSessionAgent(s, projects)
    ;(byAgent[agent] ??= {})[id] = s
  }
  const out: AgentActivity[] = []
  for (const [agent, group] of Object.entries(byAgent)) {
    const w = computeActivityWindow({ sessions: group, now })
    if (w.sessions > 0) out.push({ agent, ...w })
  }
  out.sort(
    (a, b) => b.activeMs - a.activeMs || b.sessions - a.sessions || a.agent.localeCompare(b.agent),
  )
  return out
}

export interface PlanLimitsData {
  codex: CodexLimits | null
  activity: AgentActivity[]
}

export function usePlanLimits(): PlanLimitsData {
  const [codex, setCodex] = useState<CodexLimits | null>(null)
  const sessions = useAppStore((s) => s.sessions)
  const projects = useAppStore((s) => s.projects)

  const load = useCallback(async (isActive: () => boolean) => {
    try {
      const next = await window.agentDeck.limits.getCodex()
      if (isActive()) setCodex(next)
    } catch {
      /* best-effort */
    }
  }, [])
  usePollEffect(load, USAGE_REFRESH_INTERVAL_MS)

  // Computed per render (not memoized) so the rolling-5h window stays current on
  // every 30s poll re-render — `codex` is the polled state, not `sessions`, so a
  // [sessions, projects] memo would freeze `now` between session changes.
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot
  const now = Date.now()
  const activity = computeAgentActivity(sessions, projects, now)
  return { codex, activity }
}
