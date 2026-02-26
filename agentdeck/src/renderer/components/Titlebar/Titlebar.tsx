import { useAppStore } from '../../store/appStore'
import type { Session } from '../../../shared/types'
import './Titlebar.css'

interface TitlebarProps {
  onCloseTab: (sessionId: string) => void
  onAddTab: () => void
}

export function Titlebar({ onCloseTab, onAddTab }: TitlebarProps): React.JSX.Element {
  const currentView = useAppStore((s) => s.currentView)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const projects = useAppStore((s) => s.projects)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const openWizard = useAppStore((s) => s.openWizard)
  const settingsProjectId = useAppStore((s) => s.settingsProjectId)
  const closeSettings = useAppStore((s) => s.closeSettings)
  const previousView = useAppStore((s) => s.previousView)

  function getProjectName(session: Session): string {
    const project = projects.find((p) => p.id === session.projectId)
    return project ? project.name : session.id
  }

  function dotStyle(status: string): React.CSSProperties {
    if (status === 'running')
      return { background: 'var(--green)', boxShadow: '0 0 5px var(--green)' }
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

      {currentView === 'home' && <div className="titlebar-center">Home</div>}
      {currentView === 'wizard' && <div className="titlebar-center">New Project</div>}
      {currentView === 'settings' && (
        <div className="titlebar-center">
          Project Settings — {projects.find((p) => p.id === settingsProjectId)?.name}
        </div>
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
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTab(s.id)
                }}
              >
                {'\u00D7'}
              </button>
            </div>
          ))}
          <div className="tab-add" onClick={onAddTab}>
            +
          </div>
        </div>
      )}

      <div className="titlebar-right">
        <button className="titlebar-btn">Ctrl+K Command</button>
        {currentView === 'home' && (
          <button className="titlebar-btn primary" onClick={openWizard}>
            + New Project
          </button>
        )}
        {currentView === 'settings' && (
          <button className="titlebar-btn" onClick={closeSettings}>
            {'\u2190'} Back to {previousView}
          </button>
        )}
      </div>
    </div>
  )
}
