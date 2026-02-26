import { useAppStore } from '../../store/appStore'
import './StatusBar.css'

export function StatusBar() {
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const projects = useAppStore((s) => s.projects)
  const currentView = useAppStore((s) => s.currentView)

  const activeCount = Object.values(sessions).filter(
    (s) => s.status === 'running'
  ).length

  let activeProjectName = null
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
        <span>&#x2B21;</span>
        <span>
          {activeCount} session{activeCount !== 1 ? 's' : ''} active
        </span>
      </div>
      <span className="status-sep">|</span>
      <div className="status-item">WSL2 · Ubuntu-24.04</div>
      {activeProjectName && (
        <>
          <span className="status-sep">|</span>
          <div className="status-item amber">{activeProjectName}</div>
        </>
      )}
      <div className="status-right">v0.1.0-alpha</div>
    </div>
  )
}
