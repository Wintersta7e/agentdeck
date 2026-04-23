import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { ScreenShell } from '../../components/shared/ScreenShell'
import { AGENT_BY_ID, agentColorVar } from '../../utils/agent-ui'
import type { AgentType } from '../../../shared/types'
import './DiffReviewScreen.css'

interface WorktreeSummary {
  hasChanges: boolean
  hasUnmerged: boolean
  branch: string
}

export function DiffReviewScreen(): React.JSX.Element {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const session = useAppStore((s) => (activeSessionId ? s.sessions[activeSessionId] : undefined))
  const gitStatus = useAppStore((s) =>
    session?.projectId ? s.gitStatuses[session.projectId] : undefined,
  )
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const addNotification = useAppStore((s) => s.addNotification)
  const clearWorktreePath = useAppStore((s) => s.clearWorktreePath)
  const removeSession = useAppStore((s) => s.removeSession)

  const [summary, setSummary] = useState<WorktreeSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [comment, setComment] = useState('')
  const [inflight, setInflight] = useState<'keep' | 'discard' | 'comment' | null>(null)

  const agentId = (session?.agentOverride ?? 'claude-code') as AgentType
  const agent = AGENT_BY_ID.get(agentId)
  const colorVar = agentColorVar(agentId)

  useEffect(() => {
    if (!activeSessionId) {
      setSummary(null)
      return
    }
    let cancelled = false
    setLoading(true)
    window.agentDeck.worktree
      .inspect(activeSessionId)
      .then((s) => {
        if (!cancelled) setSummary(s)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          addNotification('warning', `Worktree inspect failed: ${String(err)}`)
          setSummary(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeSessionId, addNotification])

  const totals = useMemo(() => {
    if (!gitStatus) return null
    return {
      staged: gitStatus.staged,
      unstaged: gitStatus.unstaged,
      untracked: gitStatus.untracked,
      insertions: gitStatus.insertions,
      deletions: gitStatus.deletions,
      changedFiles: gitStatus.staged + gitStatus.unstaged + gitStatus.untracked,
    }
  }, [gitStatus])

  const handleKeep = useCallback(() => {
    if (!activeSessionId) return
    setInflight('keep')
    window.agentDeck.worktree
      .keep(activeSessionId)
      .then(() => {
        addNotification('info', 'Worktree merged; branch kept.')
        clearWorktreePath(activeSessionId)
        removeSession(activeSessionId)
        setCurrentView('home')
      })
      .catch((err: unknown) => {
        addNotification('error', `Keep failed: ${String(err)}`)
      })
      .finally(() => setInflight(null))
  }, [activeSessionId, addNotification, clearWorktreePath, removeSession, setCurrentView])

  const handleDiscard = useCallback(() => {
    if (!activeSessionId) return
    setInflight('discard')
    window.agentDeck.worktree
      .discard(activeSessionId)
      .then(() => {
        addNotification('info', 'Worktree discarded.')
        clearWorktreePath(activeSessionId)
        removeSession(activeSessionId)
        setCurrentView('home')
      })
      .catch((err: unknown) => {
        addNotification('error', `Discard failed: ${String(err)}`)
      })
      .finally(() => setInflight(null))
  }, [activeSessionId, addNotification, clearWorktreePath, removeSession, setCurrentView])

  const handleRequestChanges = useCallback(() => {
    if (!activeSessionId || comment.trim().length === 0) return
    setInflight('comment')
    try {
      const payload = `\n[Review feedback]\n${comment.trim()}\n`
      window.agentDeck.pty.write(activeSessionId, payload)
      addNotification('info', 'Feedback sent to the agent.')
      setComment('')
      setCurrentView('session')
    } catch (err) {
      addNotification('error', `Send failed: ${String(err)}`)
    } finally {
      setInflight(null)
    }
  }, [activeSessionId, comment, addNotification, setCurrentView])

  return (
    <ScreenShell
      eyebrow="Review"
      title="Diff review"
      sub="Inspect the agent's changes, keep them as-is, discard the worktree, or ask for changes."
      className="diff-review-screen"
    >
      {!activeSessionId ? (
        <div className="dr-empty">
          No active session. Open a session first — the Diff tab only surfaces when the agent has
          produced changes in its worktree.
        </div>
      ) : (
        <div className="dr-grid">
          <section className="dr-panel dr-summary">
            <header className="dr-panel__head">
              <span className="dr-panel__title">SUMMARY</span>
              {summary?.branch && <span className="dr-summary__branch">⎇ {summary.branch}</span>}
            </header>
            {loading && !summary ? (
              <div className="dr-panel__body dr-panel__body--muted">Inspecting worktree…</div>
            ) : (
              <div className="dr-panel__body">
                <div
                  className="dr-summary__agent"
                  style={{ ['--sel-color' as 'color']: `var(${colorVar})` }}
                >
                  <span className="dr-summary__glyph" aria-hidden="true">
                    {agent?.icon ?? '◈'}
                  </span>
                  <div>
                    <div className="dr-summary__agent-name">{agent?.name ?? agentId}</div>
                    <div className="dr-summary__agent-session">
                      session <code>{activeSessionId.slice(-8)}</code>
                    </div>
                  </div>
                </div>

                <dl className="dr-summary__stats">
                  <div>
                    <dt>Changed files</dt>
                    <dd>{totals?.changedFiles ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Insertions</dt>
                    <dd className="dr-stat--green">+{totals?.insertions ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Deletions</dt>
                    <dd className="dr-stat--red">−{totals?.deletions ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Unmerged</dt>
                    <dd>{summary?.hasUnmerged ? 'yes' : 'none'}</dd>
                  </div>
                </dl>

                {summary && !summary.hasChanges && !summary.hasUnmerged && (
                  <div className="dr-summary__note">
                    Worktree is clean — the agent hasn&apos;t modified any tracked files in this
                    session.
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="dr-panel dr-files">
            <header className="dr-panel__head">
              <span className="dr-panel__title">FILES</span>
              <span className="dr-panel__sub">
                Per-file diff requires a git-IPC extension — shipping in a follow-up.
              </span>
            </header>
            <div className="dr-panel__body">
              {totals && totals.changedFiles > 0 ? (
                <div className="dr-files__placeholder">
                  <div className="dr-files__icon">⎇</div>
                  <div className="dr-files__heading">
                    {totals.changedFiles} file{totals.changedFiles === 1 ? '' : 's'} changed
                  </div>
                  <div className="dr-files__hint">
                    Open the session terminal and run <code>git diff</code> or
                    <code> git status</code> in the worktree to see the full set.
                  </div>
                  <button
                    type="button"
                    className="dr-link"
                    onClick={() => setCurrentView('session')}
                  >
                    Return to session →
                  </button>
                </div>
              ) : (
                <div className="dr-files__placeholder">
                  <div className="dr-files__icon">✓</div>
                  <div className="dr-files__heading">Nothing to review yet.</div>
                  <div className="dr-files__hint">
                    Changes appear here automatically once the agent writes to the worktree.
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="dr-panel dr-feedback">
            <header className="dr-panel__head">
              <span className="dr-panel__title">FEEDBACK</span>
              <span className="dr-panel__sub">Request changes via stdin</span>
            </header>
            <div className="dr-panel__body">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Leave feedback here — it gets piped straight into the agent's stdin when you click Request changes."
                className="dr-textarea"
                rows={6}
                aria-label="Request changes comment"
              />

              <div className="dr-actions">
                <button
                  type="button"
                  className="dr-btn dr-btn--danger"
                  disabled={inflight !== null || !summary?.hasChanges}
                  onClick={handleDiscard}
                >
                  {inflight === 'discard' ? 'Discarding…' : 'Discard worktree'}
                </button>
                <button
                  type="button"
                  className="dr-btn"
                  disabled={inflight !== null || comment.trim().length === 0}
                  onClick={handleRequestChanges}
                >
                  {inflight === 'comment' ? 'Sending…' : 'Request changes'}
                </button>
                <button
                  type="button"
                  className="dr-btn dr-btn--primary"
                  disabled={inflight !== null}
                  onClick={handleKeep}
                >
                  {inflight === 'keep' ? 'Keeping…' : '▸ Keep changes'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </ScreenShell>
  )
}
