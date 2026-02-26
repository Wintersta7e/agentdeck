import { useAppStore } from '../../store/appStore'
import './Titlebar.css'

export function Titlebar({ onCloseTab, onAddTab }) {
  const currentView = useAppStore((s) => s.currentView)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const projects = useAppStore((s) => s.projects)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setCurrentView = useAppStore((s) => s.setCurrentView)

  function getProjectName(session) {
    const project = projects.find((p) => p.id === session.projectId)
    return project ? project.name : session.id
  }

  function dotStyle(status) {
    if (status === 'running') return { background: 'var(--green)', boxShadow: '0 0 5px var(--green)' }
    if (status === 'error') return { background: 'var(--red)', boxShadow: '0 0 5px var(--red)' }
    return { background: 'var(--text3)' }
  }

  const sessionList = Object.values(sessions)

  return (
    <div className="titlebar">
      <div className="titlebar-controls">
        <div className="control control-close" onClick={() => window.agentDeck.window.close()} />
        <div className="control control-min" onClick={() => window.agentDeck.window.minimize()} />
        <div className="control control-max" onClick={() => window.agentDeck.window.maximize()} />
      </div>

      <div className="titlebar-logo" onClick={() => setCurrentView('home')}>
        <div className="logo-mark" />
        <div className="logo-text">
          Agent<span>Deck</span>
        </div>
      </div>

      {currentView === 'home' && (
        <div className="titlebar-center">Home</div>
      )}

      {currentView === 'session' && sessionList.length > 0 && (
        <div className="tab-bar">
          {sessionList.map((s) => (
            <div
              key={s.id}
              className={`tab ${s.id === activeSessionId ? 'active' : ''}`}
              onClick={() => setActiveSession(s.id)}
            >
              <div className="tab-dot" style={dotStyle(s.status)} />
              {getProjectName(s)}
              <button
                className="tab-close"
                onClick={(e) => { e.stopPropagation(); onCloseTab(s.id) }}
              >
                {'\u00D7'}
              </button>
            </div>
          ))}
          <div className="tab-add" onClick={onAddTab}>+</div>
        </div>
      )}

      <div className="titlebar-right">
        <button className="titlebar-btn">Ctrl+K Command</button>
        {currentView === 'home' && (
          <button className="titlebar-btn primary">+ New Project</button>
        )}
      </div>
    </div>
  )
}
