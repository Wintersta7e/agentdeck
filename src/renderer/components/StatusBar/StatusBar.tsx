import { useEffect, useState } from 'react'
import { Keyboard, Menu } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
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
  const wslDistro = useAppStore((s) => s.wslDistro)
  // PERF-18: Serialize worktree isolation state to avoid O(n) scan on every store update
  const hasWorktree = useAppStore((s) => {
    for (const w of Object.values(s.worktreePaths)) {
      if (w.isolated) return true
    }
    return false
  })

  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    let cancelled = false
    window.agentDeck.app
      .version()
      .then((v) => {
        if (!cancelled) setAppVersion(v)
      })
      .catch((err: unknown) => {
        window.agentDeck.log.send('warn', 'statusbar', 'Failed to get app version', {
          err: String(err),
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const layoutLabel = paneLayout === 1 ? 'single pane' : `${String(paneLayout)}-pane split`

  return (
    <div className="statusbar" role="status">
      <div className={`status-item ${activeCount > 0 ? 'green' : ''}`}>
        <span className={`status-dot${activeCount > 0 ? ' active' : ''}`} />
        <span>
          {activeCount} session{activeCount !== 1 ? 's' : ''} active
        </span>
      </div>
      <span className="status-sep">|</span>
      <div className="status-item">WSL2{wslDistro ? ` \u00b7 ${wslDistro}` : ''}</div>
      {hasWorktree && (
        <>
          <span className="status-sep">|</span>
          <span className="status-item status-worktree">Worktree</span>
        </>
      )}
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
        <button className="status-cmd" onClick={onShortcutsClick} aria-label="Keyboard shortcuts">
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
