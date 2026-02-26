import { useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import './PaneTopbar.css'

interface PaneTopbarProps {
  sessionId: string
  focused: boolean
}

export function PaneTopbar({ sessionId, focused }: PaneTopbarProps): React.JSX.Element {
  const session = useAppStore((s) => s.sessions[sessionId])
  const projects = useAppStore((s) => s.projects)
  const project = session ? projects.find((p) => p.id === session.projectId) : undefined

  const status = session?.status ?? 'exited'
  const accentColor = project?.identity?.accentColor ?? undefined
  const agentName = project?.agent ?? 'claude-code'

  const handleRestart = useCallback(() => {
    void window.agentDeck.pty.kill(sessionId)
  }, [sessionId])

  return (
    <div className={`pane-topbar${focused ? ' focused' : ''}`}>
      <div className="pane-accent" style={accentColor ? { background: accentColor } : undefined} />
      <span className="pane-project">{project?.name ?? 'Unknown'}</span>
      <span className="pane-sep">&gt;</span>
      <span className="pane-path">{project?.path ?? ''}</span>
      <div className="pane-status">
        <div className={`pane-status-dot ${status}`} />
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
}
