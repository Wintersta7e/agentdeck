import { useAppStore } from '../../store/appStore'
import type { Session } from '../../../shared/types'
import './Titlebar.css'

interface TitlebarProps {
  onCloseTab: (sessionId: string) => void
  onCloseWorkflowTab: (workflowId: string) => void
  onAddTab: () => void
}

export function Titlebar({
  onCloseTab,
  onCloseWorkflowTab,
  onAddTab,
}: TitlebarProps): React.JSX.Element {
  const currentView = useAppStore((s) => s.currentView)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const projects = useAppStore((s) => s.projects)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const closeWizard = useAppStore((s) => s.closeWizard)
  const settingsProjectId = useAppStore((s) => s.settingsProjectId)
  const closeSettings = useAppStore((s) => s.closeSettings)
  const viewStack = useAppStore((s) => s.viewStack)
  const previousView = viewStack.length > 0 ? viewStack[viewStack.length - 1] : 'home'
  const paneLayout = useAppStore((s) => s.paneLayout)
  const cyclePaneLayout = useAppStore((s) => s.cyclePaneLayout)
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel)
  const closeTemplateEditor = useAppStore((s) => s.closeTemplateEditor)
  const openWorkflowIds = useAppStore((s) => s.openWorkflowIds)
  const activeWorkflowId = useAppStore((s) => s.activeWorkflowId)
  const openWorkflow = useAppStore((s) => s.openWorkflow)
  const workflows = useAppStore((s) => s.workflows)

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
      {currentView === 'template-editor' && <div className="titlebar-center">Templates</div>}
      {(sessionList.length > 0 || openWorkflowIds.length > 0) && (
        <div className="tab-bar">
          {sessionList.map((s) => (
            <div
              key={s.id}
              className={`tab ${s.id === activeSessionId && currentView === 'session' ? 'active' : ''}`}
              onClick={() => {
                setActiveSession(s.id)
                setCurrentView('session')
              }}
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
          {openWorkflowIds.map((wfId) => (
            <div
              key={wfId}
              className={`tab tab-workflow${wfId === activeWorkflowId && currentView === 'workflow' ? ' active' : ''}`}
              onClick={() => openWorkflow(wfId)}
            >
              <span className="tab-wf-icon">{'\u2B21'}</span>
              {workflows.find((w) => w.id === wfId)?.name ?? 'Workflow'}
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseWorkflowTab(wfId)
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
        {currentView === 'session' && sessionList.length > 0 && (
          <>
            <button className="titlebar-btn" onClick={cyclePaneLayout}>
              Split{paneLayout > 1 ? ` (${String(paneLayout)})` : ''}
            </button>
            <button className="titlebar-btn" onClick={toggleRightPanel}>
              Panel
            </button>
          </>
        )}
        {currentView === 'wizard' && (
          <button className="titlebar-btn" onClick={closeWizard}>
            {'\u2190'} Cancel
          </button>
        )}
        {currentView === 'settings' && (
          <button className="titlebar-btn" onClick={closeSettings}>
            {'\u2190'} Back to {previousView}
          </button>
        )}
        {currentView === 'template-editor' && (
          <button className="titlebar-btn" onClick={closeTemplateEditor}>
            {'\u2190'} Back
          </button>
        )}
      </div>

      <div className="window-controls">
        <button
          className="window-btn"
          onClick={() => window.agentDeck.window.minimize()}
          title="Minimize"
        >
          {'\u2500'}
        </button>
        <button
          className="window-btn"
          onClick={() => window.agentDeck.window.maximize()}
          title="Maximize"
        >
          {'\u25A1'}
        </button>
        <button
          className="window-btn window-btn-close"
          onClick={() => window.agentDeck.window.close()}
          title="Close"
        >
          {'\u2715'}
        </button>
      </div>
    </div>
  )
}
