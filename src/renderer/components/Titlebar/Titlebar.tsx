import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { X, Minus, Square, ArrowLeft, Plus, Hexagon } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { HexDot } from '../shared/HexDot'
import type { Session } from '../../../shared/types'
import './Titlebar.css'

interface TitlebarProps {
  onCloseTab: (sessionId: string) => void
  onCloseWorkflowTab: (workflowId: string) => void
  onAddTab: () => void
  isIdle?: boolean | undefined
}

export function Titlebar({
  onCloseTab,
  onCloseWorkflowTab,
  onAddTab,
  isIdle,
}: TitlebarProps): React.JSX.Element {
  const [closingTabs, setClosingTabs] = useState<Set<string>>(() => new Set())
  const closeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(
    () => () => {
      closeTimersRef.current.forEach(clearTimeout)
      closeTimersRef.current.clear()
    },
    [],
  )

  const animateCloseSession = useCallback(
    (sessionId: string) => {
      setClosingTabs((prev) => new Set(prev).add(sessionId))
      const timer = setTimeout(() => {
        closeTimersRef.current.delete(sessionId)
        setClosingTabs((prev) => {
          const next = new Set(prev)
          next.delete(sessionId)
          return next
        })
        onCloseTab(sessionId)
      }, 250)
      closeTimersRef.current.set(sessionId, timer)
    },
    [onCloseTab],
  )

  const animateCloseWorkflow = useCallback(
    (workflowId: string) => {
      setClosingTabs((prev) => new Set(prev).add(workflowId))
      const timer = setTimeout(() => {
        closeTimersRef.current.delete(workflowId)
        setClosingTabs((prev) => {
          const next = new Set(prev)
          next.delete(workflowId)
          return next
        })
        onCloseWorkflowTab(workflowId)
      }, 250)
      closeTimersRef.current.set(workflowId, timer)
    },
    [onCloseWorkflowTab],
  )
  const currentView = useAppStore((s) => s.currentView)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const projects = useAppStore((s) => s.projects)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const closeWizard = useAppStore((s) => s.closeWizard)
  const settingsProjectId = useAppStore((s) => s.settingsProjectId)
  const closeSettings = useAppStore((s) => s.closeSettings)
  const previousView = useAppStore((s) =>
    s.viewStack.length > 0 ? s.viewStack[s.viewStack.length - 1] : 'home',
  )
  const paneLayout = useAppStore((s) => s.paneLayout)
  const cyclePaneLayout = useAppStore((s) => s.cyclePaneLayout)
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel)
  const closeTemplateEditor = useAppStore((s) => s.closeTemplateEditor)
  const openWorkflowIds = useAppStore((s) => s.openWorkflowIds)
  const activeWorkflowId = useAppStore((s) => s.activeWorkflowId)
  const openWorkflow = useAppStore((s) => s.openWorkflow)
  const workflows = useAppStore((s) => s.workflows)

  // Memoize project name lookup map — avoids O(n) find per tab on every render
  const projectNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of projects) map.set(p.id, p.name)
    return map
  }, [projects])

  // Memoize workflow name lookup map
  const workflowNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const w of workflows) map.set(w.id, w.name)
    return map
  }, [workflows])

  const getProjectName = useCallback(
    (session: Session): string => {
      if (!session.projectId) return 'Terminal'
      return projectNameMap.get(session.projectId) ?? session.id
    },
    [projectNameMap],
  )

  const sessionList = useMemo(() => Object.values(sessions), [sessions])

  return (
    <div className="titlebar">
      <div className="titlebar-logo" onClick={() => setCurrentView('home')} title="Home">
        <div className={`logo-mark${isIdle ? '' : ' logo-mark--active'}`} />
        <div className="logo-text">
          Agent<span>Deck</span>
        </div>
      </div>

      {currentView === 'home' && <div className="titlebar-center">Home</div>}
      {currentView === 'wizard' && <div className="titlebar-center">New Project</div>}
      {currentView === 'settings' && (
        <div className="titlebar-center">
          Project Settings —{' '}
          {settingsProjectId ? (projectNameMap.get(settingsProjectId) ?? '') : ''}
        </div>
      )}
      {currentView === 'template-editor' && <div className="titlebar-center">Templates</div>}
      {(sessionList.length > 0 || openWorkflowIds.length > 0) && (
        <div className="tab-bar">
          {sessionList.map((s) => (
            <div
              key={s.id}
              className={`tab${s.id === activeSessionId && currentView === 'session' ? ' active' : ''}${closingTabs.has(s.id) ? ' closing' : ''}`}
              onClick={() => {
                setActiveSession(s.id)
                setCurrentView('session')
              }}
            >
              <HexDot
                status={s.status === 'running' ? 'live' : s.status === 'error' ? 'error' : 'idle'}
                size={6}
              />
              {getProjectName(s)}
              <button
                className="tab-close"
                aria-label="Close session tab"
                onClick={(e) => {
                  e.stopPropagation()
                  animateCloseSession(s.id)
                }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {openWorkflowIds.map((wfId) => (
            <div
              key={wfId}
              className={`tab tab-workflow${wfId === activeWorkflowId && currentView === 'workflow' ? ' active' : ''}${closingTabs.has(wfId) ? ' closing' : ''}`}
              onClick={() => openWorkflow(wfId)}
            >
              <span className="tab-wf-icon">
                <Hexagon size={12} />
              </span>
              {workflowNameMap.get(wfId) ?? 'Workflow'}
              <button
                className="tab-close"
                aria-label="Close workflow tab"
                onClick={(e) => {
                  e.stopPropagation()
                  animateCloseWorkflow(wfId)
                }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <div className="tab-add" onClick={onAddTab} role="button" aria-label="New tab">
            <Plus size={14} />
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
            <ArrowLeft size={14} /> Cancel
          </button>
        )}
        {currentView === 'settings' && (
          <button className="titlebar-btn" onClick={closeSettings}>
            <ArrowLeft size={14} /> Back to {previousView}
          </button>
        )}
        {currentView === 'template-editor' && (
          <button className="titlebar-btn" onClick={closeTemplateEditor}>
            <ArrowLeft size={14} /> Back
          </button>
        )}
      </div>

      <div className="window-controls">
        <button
          className="window-btn"
          onClick={() => window.agentDeck.window.minimize()}
          title="Minimize"
        >
          <Minus size={12} />
        </button>
        <button
          className="window-btn"
          onClick={() => window.agentDeck.window.maximize()}
          title="Maximize"
        >
          <Square size={12} />
        </button>
        <button
          className="window-btn window-btn-close"
          onClick={() => window.agentDeck.window.close()}
          title="Close"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}
