import { memo, useCallback } from 'react'
import { GitBranch } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { HexDot } from '../shared/HexDot'
import './PaneTopbar.css'

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
  const projects = useAppStore((s) => s.projects)
  const worktreeInfo = useAppStore((s) => s.worktreePaths[sessionId])
  const restartSession = useAppStore((s) => s.restartSession)
  const project = projectId ? projects.find((p) => p.id === projectId) : undefined

  const isTerminal = !projectId
  const accentColor = project?.identity?.accentColor ?? undefined
  const agentName = isTerminal
    ? 'shell'
    : (project?.agents?.find((a) => a.isDefault)?.agent ?? project?.agent ?? 'claude-code')

  // Extract a clean display name: use project name, but if it looks like a path, take the last segment
  const rawName = isTerminal ? 'Terminal' : (project?.name ?? 'Unknown')
  const displayName =
    rawName.includes('/') || rawName.includes('\\')
      ? (rawName.split(/[/\\]/).filter(Boolean).pop() ?? rawName)
      : rawName
  const projectPath = project?.path ?? ''
  // Only show path separately if it adds info beyond the name
  const showPath = projectPath !== '' && projectPath !== rawName

  const handleRestart = useCallback(() => {
    // Kill old PTY, then swap in a fresh session for the same project
    void window.agentDeck.pty.kill(sessionId).then(() => {
      restartSession(sessionId)
    })
  }, [sessionId, restartSession])

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
        <button className="pane-btn" onClick={handleRestart}>
          Restart
        </button>
        <button className="pane-btn primary">{agentName}</button>
      </div>
    </div>
  )
})
