import { useEffect, useState } from 'react'
import { Keyboard, Menu } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { HexDot } from '../shared/HexDot'
import './StatusBar.css'

interface StatusBarProps {
  onAboutClick?: (() => void) | undefined
  onShortcutsClick?: (() => void) | undefined
}

export function StatusBar({ onAboutClick, onShortcutsClick }: StatusBarProps): React.JSX.Element {
  // Granular scalar selectors — only re-render when the derived value changes
  const activeCount = useAppStore(
    (s) => Object.values(s.sessions).filter((sess) => sess.status === 'running').length,
  )
  const activeProjectName = useAppStore((s) => {
    if (s.currentView !== 'session' || !s.activeSessionId) return null
    const session = s.sessions[s.activeSessionId]
    if (!session) return null
    if (!session.projectId) return 'Terminal'
    return s.projects.find((p) => p.id === session.projectId)?.name ?? null
  })
  const activeWorkflowName = useAppStore((s) => {
    if (s.currentView !== 'workflow' || !s.activeWorkflowId) return null
    return s.workflows.find((w) => w.id === s.activeWorkflowId)?.name ?? null
  })
  const activeWorkflowStatus = useAppStore((s) => {
    if (s.currentView !== 'workflow' || !s.activeWorkflowId) return null
    return s.workflowStatuses[s.activeWorkflowId] ?? null
  })
  const currentView = useAppStore((s) => s.currentView)
  const paneLayout = useAppStore((s) => s.paneLayout)
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen)
  const openCommandPalette = useAppStore((s) => s.openCommandPalette)
  const zoomFactor = useAppStore((s) => s.zoomFactor)

  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.agentDeck.app
      .version()
      .then(setAppVersion)
      .catch((err: unknown) => {
        window.agentDeck.log.send('warn', 'statusbar', 'Failed to get app version', {
          err: String(err),
        })
      })
  }, [])

  const layoutLabel = paneLayout === 1 ? 'single pane' : `${String(paneLayout)}-pane split`

  return (
    <div className="statusbar">
      <div className={`status-item ${activeCount > 0 ? 'green' : ''}`}>
        <HexDot status={activeCount > 0 ? 'live' : 'idle'} size={5} />
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
      {activeWorkflowStatus && (
        <>
          <span className="status-sep">|</span>
          <div className="status-item">{activeWorkflowStatus}</div>
        </>
      )}
      <div className="status-right">
        {zoomFactor !== 1.0 && (
          <>
            <span className="status-item">{Math.round(zoomFactor * 100)}%</span>
            <span className="status-sep">|</span>
          </>
        )}
        <button className="status-cmd" onClick={onShortcutsClick}>
          <span className="status-cmd-icon">
            <Keyboard size={14} />
          </span>
          <kbd className="status-cmd-kbd">Ctrl+/</kbd>
        </button>
        <button className="status-cmd" onClick={() => openCommandPalette()}>
          <span className="status-cmd-icon">
            <Menu size={14} />
          </span>
          <span>Menu</span>
          <kbd className="status-cmd-kbd">Esc</kbd>
        </button>
        <span className="status-sep">|</span>
        <button className="status-version" onClick={onAboutClick}>
          v{appVersion}
        </button>
      </div>
    </div>
  )
}
