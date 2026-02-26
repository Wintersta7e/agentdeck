import { useAppStore } from '../../store/appStore'
import './StatusBar.css'

export function StatusBar(): React.JSX.Element {
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const projects = useAppStore((s) => s.projects)
  const currentView = useAppStore((s) => s.currentView)

  const paneLayout = useAppStore((s) => s.paneLayout)
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen)
  const openCommandPalette = useAppStore((s) => s.openCommandPalette)

  const activeCount = Object.values(sessions).filter((s) => s.status === 'running').length
  const layoutLabel = paneLayout === 1 ? 'single pane' : `${String(paneLayout)}-pane split`

  let activeProjectName: string | null = null
  if (currentView === 'session' && activeSessionId) {
    const session = sessions[activeSessionId]
    if (session) {
      const project = projects.find((p) => p.id === session.projectId)
      activeProjectName = project ? project.name : null
    }
  }

  return (
    <div className="statusbar">
      <div className={`status-item ${activeCount > 0 ? 'green' : ''}`}>
        <span>{'\u2B21'}</span>
        <span>
          {activeCount} session{activeCount !== 1 ? 's' : ''} active
        </span>
      </div>
      <span className="status-sep">|</span>
      <div className="status-item">WSL2 &middot; Ubuntu-24.04</div>
      {activeProjectName && (
        <>
          <span className="status-sep">|</span>
          <div className="status-item amber">{activeProjectName}</div>
        </>
      )}
      {currentView === 'session' && (
        <>
          <span className="status-sep">|</span>
          <div className="status-item">{layoutLabel}</div>
          <span className="status-sep">|</span>
          <div className="status-item">{rightPanelOpen ? 'Panel open' : 'Panel closed'}</div>
        </>
      )}
      <div className="status-right">
        <button className="status-cmd" onClick={openCommandPalette}>
          Ctrl+K
        </button>
        <span className="status-sep">|</span>
        v0.1.0-alpha
      </div>
    </div>
  )
}
