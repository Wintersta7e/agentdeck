import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store/appStore'
import type { CodexLimits, PlanWindow, Session } from '../../shared/types'
import { USAGE_REFRESH_INTERVAL_MS } from '../../shared/constants'
import { resolveSessionAgent } from '../utils/resolve-session-agent'

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
    activeMs += Math.max(0, now - s.startedAt)
  }
  return { sessions: count, activeMs }
}

export interface CodexLimitsData {
  codex: CodexLimits | null
  claude: ActivityWindow
}

export function useCodexLimits(): CodexLimitsData {
  const [codex, setCodex] = useState<CodexLimits | null>(null)
  const sessions = useAppStore((s) => s.sessions)
  const projects = useAppStore((s) => s.projects)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const next = await window.agentDeck.limits.getCodex()
        if (!cancelled) setCodex(next)
      } catch {
        /* best-effort */
      }
    }
    void load()
    const interval = setInterval(() => void load(), USAGE_REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const claude = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- render-time snapshot; matches useProductivity
    const now = Date.now()
    const claudeSessions = Object.fromEntries(
      Object.entries(sessions).filter(
        ([, s]) => resolveSessionAgent(s, projects) === 'claude-code',
      ),
    )
    return computeActivityWindow({ sessions: claudeSessions, now })
  }, [sessions, projects])
  return { codex, claude }
}
