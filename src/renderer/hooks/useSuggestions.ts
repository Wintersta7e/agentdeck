import { useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import type { Suggestion } from '../../shared/types'

const DISMISS_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

// Module-level cache — populated once on module load, updated on dismiss
const dismissedCache = new Set<string>()

try {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('dismiss:')) {
      const ts = localStorage.getItem(key)
      if (ts && Date.now() - parseInt(ts, 10) < DISMISS_TTL_MS) {
        dismissedCache.add(key.slice('dismiss:'.length))
      }
    }
  }
} catch {
  // localStorage unavailable
}

function isDismissed(key: string): boolean {
  return dismissedCache.has(key)
}

export function dismissSuggestion(key: string): void {
  dismissedCache.add(key)
  try {
    localStorage.setItem(`dismiss:${key}`, String(Date.now()))
  } catch {
    // localStorage unavailable
  }
}

export function useSuggestions(): Suggestion[] {
  // Primitive selector — re-renders only when the sorted ID string changes
  const runningProjectIdStr = useAppStore((s) => {
    const ids: string[] = []
    for (const sess of Object.values(s.sessions)) {
      if (sess.status === 'running' && sess.projectId) ids.push(sess.projectId)
    }
    return ids.sort().join(',')
  })
  const sessionCount = useAppStore((s) => Object.keys(s.sessions).length)
  const errorSessionKeys = useAppStore((s) =>
    Object.values(s.sessions)
      .filter((sess) => sess.status === 'error')
      .map((sess) => sess.id)
      .sort()
      .join(','),
  )
  const gitStatuses = useAppStore((s) => s.gitStatuses)
  const agentVersions = useAppStore((s) => s.agentVersions)

  const runningProjectIds = useMemo(
    () => new Set(runningProjectIdStr ? runningProjectIdStr.split(',') : []),
    [runningProjectIdStr],
  )

  return useMemo(() => {
    const suggestions: Suggestion[] = []

    // Error sessions (priority 1)
    for (const key of errorSessionKeys ? errorSessionKeys.split(',') : []) {
      if (!key) continue
      const dismissKey = `error-${key}`
      if (!isDismissed(dismissKey)) {
        suggestions.push({
          id: dismissKey,
          priority: 1,
          icon: '\u26A0',
          text: `Session errored in project`,
          actionLabel: 'View',
          dismissKey,
        })
      }
    }

    // Uncommitted changes (priority 3)
    for (const [projectId, status] of Object.entries(gitStatuses)) {
      if (!status) continue
      const uncommitted = status.staged + status.unstaged + status.untracked
      if (uncommitted > 0 && runningProjectIds.has(projectId)) {
        const dismissKey = `uncommitted-${projectId}`
        if (!isDismissed(dismissKey)) {
          suggestions.push({
            id: dismissKey,
            priority: 3,
            icon: '\u26A0',
            text: `${uncommitted} uncommitted change${uncommitted !== 1 ? 's' : ''} while agents are running`,
            actionLabel: 'Commit now',
            dismissKey,
          })
        }
      }
    }

    // Agent updates (priority 4)
    for (const [agentId, info] of Object.entries(agentVersions)) {
      if (info.updateAvailable) {
        const dismissKey = `update-${agentId}`
        if (!isDismissed(dismissKey)) {
          suggestions.push({
            id: dismissKey,
            priority: 4,
            icon: '\u21BB',
            text: `${agentId} update available (${info.current ?? '?'} \u2192 ${info.latest ?? 'latest'})`,
            actionLabel: 'Update',
            dismissKey,
          })
        }
      }
    }

    // No sessions (priority 6)
    if (sessionCount === 0) {
      const dismissKey = 'no-sessions'
      if (!isDismissed(dismissKey)) {
        suggestions.push({
          id: dismissKey,
          priority: 6,
          icon: '\u26A1',
          text: 'No sessions running. Start working on a project?',
          actionLabel: 'New session',
          dismissKey,
        })
      }
    }

    return suggestions.sort((a, b) => a.priority - b.priority).slice(0, 3)
  }, [errorSessionKeys, gitStatuses, agentVersions, runningProjectIds, sessionCount])
}
