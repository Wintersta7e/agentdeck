import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import './DiffTab.css'

/**
 * Right-inspector Diff summary for the active session.
 * Reads the session's worktree via `worktree.inspect` and cross-references
 * the gitStatuses slice for per-project insert/delete counters. Clicking
 * "Open full review" routes to the Diff tab view (`currentView = diff`).
 */
export function DiffTab(): React.JSX.Element {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const session = useAppStore((s) => (activeSessionId ? s.sessions[activeSessionId] : undefined))
  const gitStatus = useAppStore((s) =>
    session?.projectId ? s.gitStatuses[session.projectId] : undefined,
  )
  const setCurrentView = useAppStore((s) => s.setCurrentView)

  const [summary, setSummary] = useState<{
    hasChanges: boolean
    hasUnmerged: boolean
    branch: string
  } | null>(null)

  useEffect(() => {
    if (!activeSessionId) return
    let cancelled = false
    window.agentDeck.worktree
      .inspect(activeSessionId)
      .then((s) => {
        if (!cancelled) setSummary(s)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          void window.agentDeck.log.send('warn', 'diff-tab', 'worktree inspect failed', {
            sessionId: activeSessionId,
            error: err instanceof Error ? err.message : String(err),
          })
          setSummary(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [activeSessionId])

  if (!activeSessionId) {
    return <div className="ri-tab__empty">Open a session to see its diff.</div>
  }

  const changed = gitStatus ? gitStatus.staged + gitStatus.unstaged + gitStatus.untracked : 0

  return (
    <div className="ri-diff">
      <div className="ri-diff__row">
        <span className="ri-diff__label">Branch</span>
        <span className="ri-diff__value">⎇ {summary?.branch ?? '…'}</span>
      </div>
      <div className="ri-diff__row">
        <span className="ri-diff__label">Changed files</span>
        <span className="ri-diff__value">{changed}</span>
      </div>
      <div className="ri-diff__row">
        <span className="ri-diff__label">Insertions</span>
        <span className="ri-diff__value ri-diff__value--green">+{gitStatus?.insertions ?? 0}</span>
      </div>
      <div className="ri-diff__row">
        <span className="ri-diff__label">Deletions</span>
        <span className="ri-diff__value ri-diff__value--red">−{gitStatus?.deletions ?? 0}</span>
      </div>
      <div className="ri-diff__row">
        <span className="ri-diff__label">Unmerged</span>
        <span className="ri-diff__value">{summary?.hasUnmerged ? 'yes' : 'none'}</span>
      </div>

      <button type="button" className="ri-diff__cta" onClick={() => setCurrentView('diff')}>
        ▸ Open full review
      </button>
    </div>
  )
}
