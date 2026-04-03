import { memo, useCallback } from 'react'
import { GitBranch, Zap } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { HexDot } from '../shared/HexDot'
import './PaneTopbar.css'

function fmtTokens(n: number): string {
  if (n < 1000) return String(n)
  return (n / 1000).toFixed(1) + 'k'
}

function fmtCost(usd: number): string {
  if (usd <= 0) return ''
  return '$' + usd.toFixed(2)
}

/** Total tokens processed (all types). Consistent with cost computation. */
function totalTokens(u: {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}): number {
  return u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens + u.outputTokens
}

interface PaneTopbarProps {
  sessionId: string
  focused: boolean
}

export const PaneTopbar = memo(function PaneTopbar({
  sessionId,
  focused,
}: PaneTopbarProps): React.JSX.Element {
  const status = useAppStore((s) => s.sessions[sessionId]?.status ?? 'exited')
  const projectId = useAppStore((s) => s.sessions[sessionId]?.projectId)
  const project = useAppStore((s) =>
    projectId ? s.projects.find((p) => p.id === projectId) : undefined,
  )
  const worktreeInfo = useAppStore((s) => s.worktreePaths[sessionId])
  const usage = useAppStore((s) => s.sessionUsage[sessionId])
  const restartSession = useAppStore((s) => s.restartSession)

  const agentOverride = useAppStore((s) => s.sessions[sessionId]?.agentOverride)
  const isTerminal = !projectId
  const accentColor = project?.identity?.accentColor ?? undefined
  const agentName = isTerminal
    ? 'shell'
    : (agentOverride ??
      project?.agents?.find((a) => a.isDefault)?.agent ??
      project?.agent ??
      'claude-code')

  // Extract a clean display name: use project name, but if it looks like a path, take the last segment
  const rawName = isTerminal ? 'Terminal' : (project?.name ?? 'Unknown')
  const displayName =
    rawName.includes('/') || rawName.includes('\\')
      ? (rawName.split(/[/\\]/).filter(Boolean).pop() ?? rawName)
      : rawName
  const projectPath = project?.path ?? ''
  // Only show path separately if it adds info beyond the name
  const showPath = projectPath !== '' && projectPath !== rawName

  const clearWorktreePath = useAppStore((s) => s.clearWorktreePath)

  const handleRestart = useCallback(() => {
    // If the old session has an isolated worktree, clean it up before restart
    const wt = useAppStore.getState().worktreePaths[sessionId]
    const cleanupPromise =
      wt?.isolated === true
        ? window.agentDeck.worktree.discard(sessionId).then(
            () => clearWorktreePath(sessionId),
            (err: unknown) => {
              window.agentDeck.log.send('warn', 'worktree', 'Discard before restart failed', {
                err: String(err),
              })
              clearWorktreePath(sessionId)
            },
          )
        : // LEAK-14: Clear worktreePaths for non-isolated sessions too
          Promise.resolve().then(() => clearWorktreePath(sessionId))

    // Kill old PTY, then swap in a fresh session for the same project
    void Promise.all([window.agentDeck.pty.kill(sessionId), cleanupPromise]).then(() => {
      restartSession(sessionId)
    })
  }, [sessionId, restartSession, clearWorktreePath])

  return (
    <div className={`pane-topbar${focused ? ' focused' : ''}`}>
      <div className="pane-accent" style={accentColor ? { background: accentColor } : undefined} />
      <span className="pane-project">{displayName}</span>
      {worktreeInfo?.isolated === true && worktreeInfo.branch !== undefined && (
        <span className="pane-worktree-badge" title={`Worktree: ${worktreeInfo.branch}`}>
          <GitBranch size={12} />
          <span>{worktreeInfo.branch.split('/').pop()}</span>
        </span>
      )}
      {usage && (usage.totalCostUsd > 0 || totalTokens(usage) > 0) && (
        <span
          className="pane-cost-badge"
          title={`Input: ${usage.inputTokens} · Output: ${usage.outputTokens} · Cache read: ${usage.cacheReadTokens} · Cache write: ${usage.cacheWriteTokens}`}
        >
          <Zap size={11} />
          {fmtCost(usage.totalCostUsd) && <span>{fmtCost(usage.totalCostUsd)}</span>}
          {fmtCost(usage.totalCostUsd) && totalTokens(usage) > 0 && <span> · </span>}
          {totalTokens(usage) > 0 && <span>{fmtTokens(totalTokens(usage))} tokens</span>}
        </span>
      )}
      {showPath && (
        <>
          <span className="pane-sep">&gt;</span>
          <span className="pane-path">{projectPath}</span>
        </>
      )}
      <div className="pane-status">
        <HexDot
          status={status === 'running' ? 'live' : status === 'error' ? 'error' : 'idle'}
          size={6}
        />
        <span className={`pane-status-text ${status}`}>{status}</span>
      </div>
      <div className="pane-actions">
        <button
          className="pane-btn"
          onClick={handleRestart}
          aria-label="Restart session"
          title="Restart session"
        >
          Restart
        </button>
        <button className="pane-btn primary" title={agentName}>
          {agentName}
        </button>
      </div>
    </div>
  )
})
