import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { X, Minus, Square, ArrowLeft, Plus } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { TitlebarBrand } from './TitlebarBrand'
import './Titlebar.css'

interface TitlebarProps {
  onCloseWorkflowTab: (workflowId: string) => void
  onAddTab: () => void
}

export function Titlebar({ onCloseWorkflowTab, onAddTab }: TitlebarProps): React.JSX.Element {
  const [closingTabs, setClosingTabs] = useState<Set<string>>(() => new Set())
  const closeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(
    () => () => {
      closeTimersRef.current.forEach(clearTimeout)
      closeTimersRef.current.clear()
    },
    [],
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
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const closeWizard = useAppStore((s) => s.closeWizard)
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

  // Memoize workflow name lookup map
  const workflowNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const w of workflows) map.set(w.id, w.name)
    return map
  }, [workflows])

  return (
    <div className="titlebar">
      <div
        className="titlebar-logo"
        onClick={() => setCurrentView('home')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setCurrentView('home')
          }
        }}
        role="button"
        tabIndex={0}
        title="Home"
      >
        <div className="logo-mark" />
        <div className="logo-text">
          Agent<span>Deck</span>
        </div>
      </div>

      <TitlebarBrand />
      {openWorkflowIds.length > 0 && (
        <div className="tab-bar" role="tablist">
          {openWorkflowIds.map((wfId) => (
            <div
              key={wfId}
              className={`tab tab-workflow${wfId === activeWorkflowId && currentView === 'workflow' ? ' active' : ''}${closingTabs.has(wfId) ? ' closing' : ''}`}
              onClick={() => openWorkflow(wfId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openWorkflow(wfId)
                }
              }}
              role="tab"
              tabIndex={0}
              aria-selected={wfId === activeWorkflowId && currentView === 'workflow'}
            >
              <div className="tab-dot tab-dot--workflow" />
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
          <div
            className="tab-add"
            onClick={onAddTab}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onAddTab()
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="New tab"
          >
            <Plus size={14} />
          </div>
        </div>
      )}

      <div className="titlebar-right">
        {currentView === 'sessions' && (
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
          aria-label="Minimize"
        >
          <Minus size={12} />
        </button>
        <button
          className="window-btn"
          onClick={() => window.agentDeck.window.maximize()}
          title="Maximize"
          aria-label="Maximize"
        >
          <Square size={12} />
        </button>
        <button
          className="window-btn window-btn-close"
          onClick={() => window.agentDeck.window.close()}
          title="Close"
          aria-label="Close window"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}
