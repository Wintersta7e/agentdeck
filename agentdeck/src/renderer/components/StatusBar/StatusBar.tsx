import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import './StatusBar.css'

interface StatusBarProps {
  onAboutClick?: (() => void) | undefined
}

export function StatusBar({ onAboutClick }: StatusBarProps): React.JSX.Element {
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const projects = useAppStore((s) => s.projects)
  const currentView = useAppStore((s) => s.currentView)
  const workflows = useAppStore((s) => s.workflows)
  const activeWorkflowId = useAppStore((s) => s.activeWorkflowId)
  const workflowStatuses = useAppStore((s) => s.workflowStatuses)

  const paneLayout = useAppStore((s) => s.paneLayout)
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen)
  const openCommandPalette = useAppStore((s) => s.openCommandPalette)
  const zoomFactor = useAppStore((s) => s.zoomFactor)

  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.agentDeck.app.version().then(setAppVersion)
  }, [])

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

  let activeWorkflowName: string | null = null
  if (currentView === 'workflow' && activeWorkflowId) {
    const wf = workflows.find((w) => w.id === activeWorkflowId)
    activeWorkflowName = wf ? wf.name : null
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
      {activeWorkflowName && (
        <>
          <span className="status-sep">|</span>
          <div className="status-item purple">{activeWorkflowName}</div>
        </>
      )}
      {currentView === 'workflow' && activeWorkflowId && workflowStatuses[activeWorkflowId] && (
        <>
          <span className="status-sep">|</span>
          <div className="status-item">{workflowStatuses[activeWorkflowId]}</div>
        </>
      )}
      <div className="status-right">
        {zoomFactor !== 1.0 && (
          <>
            <span className="status-item">{Math.round(zoomFactor * 100)}%</span>
            <span className="status-sep">|</span>
          </>
        )}
        <button className="status-cmd" onClick={() => openCommandPalette()}>
          Esc
        </button>
        <span className="status-sep">|</span>
        <button className="status-version" onClick={onAboutClick}>
          v{appVersion}
        </button>
      </div>
    </div>
  )
}
