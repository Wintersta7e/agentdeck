import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import type { CodexLimits, PlanWindow, Session } from '../../shared/types'
import { USAGE_REFRESH_INTERVAL_MS } from '../../shared/constants'

export interface ResolvedWindow {
  usedPercent: number
  windowMinutes: number
  resetsAt: number
  resetsInSec: number
}

export interface ClaudeWindow {
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
export function computeClaudeWindow({
  sessions,
  now,
}: {
  sessions: Record<string, Session>
  now: number
}): ClaudeWindow {
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
  claude: ClaudeWindow
}

export function useCodexLimits(): CodexLimitsData {
  const [codex, setCodex] = useState<CodexLimits | null>(null)
  const sessions = useAppStore((s) => s.sessions)

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

  // `now` is captured once at render time; matches useProductivity pattern
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const claude = computeClaudeWindow({ sessions, now })
  return { codex, claude }
}
