import { useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import type { Suggestion } from '../../shared/types'

const DISMISS_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

function isDismissed(key: string): boolean {
  try {
    const ts = localStorage.getItem(`dismiss:${key}`)
    if (!ts) return false
    return Date.now() - parseInt(ts, 10) < DISMISS_TTL_MS
  } catch {
    return false
  }
}

export function dismissSuggestion(key: string): void {
  try {
    localStorage.setItem(`dismiss:${key}`, String(Date.now()))
  } catch {
    // localStorage unavailable
  }
}

export function useSuggestions(): Suggestion[] {
  const sessions = useAppStore((s) => s.sessions)
  const gitStatuses = useAppStore((s) => s.gitStatuses)
  const agentVersions = useAppStore((s) => s.agentVersions)

  return useMemo(() => {
    const suggestions: Suggestion[] = []

    // Error sessions (priority 1)
    for (const s of Object.values(sessions)) {
      if (s.status === 'error') {
        const key = `error-${s.id}`
        if (!isDismissed(key)) {
          suggestions.push({
            id: key,
            priority: 1,
            icon: '\u26A0',
            text: `Session errored in project`,
            actionLabel: 'View',
            dismissKey: key,
          })
        }
      }
    }

    // Uncommitted changes (priority 3)
    for (const [projectId, status] of Object.entries(gitStatuses)) {
      if (!status) continue
      const uncommitted = status.staged + status.unstaged + status.untracked
      if (uncommitted > 0) {
        const hasRunning = Object.values(sessions).some(
          (s) => s.projectId === projectId && s.status === 'running',
        )
        if (hasRunning) {
          const key = `uncommitted-${projectId}`
          if (!isDismissed(key)) {
            suggestions.push({
              id: key,
              priority: 3,
              icon: '\u26A0',
              text: `${uncommitted} uncommitted change${uncommitted !== 1 ? 's' : ''} while agents are running`,
              actionLabel: 'Commit now',
              dismissKey: key,
            })
          }
        }
      }
    }

    // Agent updates (priority 4)
    for (const [agentId, info] of Object.entries(agentVersions)) {
      if (info.updateAvailable) {
        const key = `update-${agentId}`
        if (!isDismissed(key)) {
          suggestions.push({
            id: key,
            priority: 4,
            icon: '\u21BB',
            text: `${agentId} update available (${info.current ?? '?'} \u2192 ${info.latest ?? 'latest'})`,
            actionLabel: 'Update',
            dismissKey: key,
          })
        }
      }
    }

    // No sessions (priority 6)
    if (Object.keys(sessions).length === 0) {
      const key = 'no-sessions'
      if (!isDismissed(key)) {
        suggestions.push({
          id: key,
          priority: 6,
          icon: '\u26A1',
          text: 'No sessions running. Start working on a project?',
          actionLabel: 'New session',
          dismissKey: key,
        })
      }
    }

    return suggestions.sort((a, b) => a.priority - b.priority).slice(0, 3)
  }, [sessions, gitStatuses, agentVersions])
}
