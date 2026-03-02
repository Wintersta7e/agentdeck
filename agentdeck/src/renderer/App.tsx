import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Titlebar } from './components/Titlebar/Titlebar'
import { Sidebar } from './components/Sidebar/Sidebar'
import { StatusBar } from './components/StatusBar/StatusBar'
import { HomeScreen } from './components/HomeScreen/HomeScreen'
import { SplitView } from './components/SplitView/SplitView'
import { RightPanel } from './components/RightPanel/RightPanel'
import { PanelDivider } from './components/shared/PanelDivider'
import { CommandPalette } from './components/CommandPalette/CommandPalette'
import { AboutDialog } from './components/AboutDialog/AboutDialog'
import { NotificationToast } from './components/NotificationToast/NotificationToast'
import { useAppStore } from './store/appStore'
import { useProjects } from './hooks/useProjects'
import type { ActivityEvent, Project } from '../shared/types'
import './App.css'

const WorkflowEditor = lazy(() => import('./screens/WorkflowEditor/WorkflowEditor'))
const ProjectSettings = lazy(() =>
  import('./components/ProjectSettings/ProjectSettings').then((m) => ({
    default: m.ProjectSettings,
  })),
)
const NewProjectWizard = lazy(() =>
  import('./components/NewProjectWizard/NewProjectWizard').then((m) => ({
    default: m.NewProjectWizard,
  })),
)
const TemplateEditor = lazy(() =>
  import('./components/TemplateEditor/TemplateEditor').then((m) => ({
    default: m.TemplateEditor,
  })),
)

export function App(): React.JSX.Element {
  const currentView = useAppStore((s) => s.currentView)
  const addSession = useAppStore((s) => s.addSession)
  const removeSession = useAppStore((s) => s.removeSession)

  const activeWorkflowId = useAppStore((s) => s.activeWorkflowId)
  const settingsProjectId = useAppStore((s) => s.settingsProjectId)

  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth)
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen)
  const rightPanelWidth = useAppStore((s) => s.rightPanelWidth)
  const setRightPanelWidth = useAppStore((s) => s.setRightPanelWidth)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const rightPanelRef = useRef<HTMLDivElement>(null)

  // Memoize dynamic panel styles to avoid new objects every render
  const sidebarStyle = useMemo<React.CSSProperties>(
    () => (sidebarOpen ? { width: sidebarWidth, flexShrink: 0 } : { width: 0, flexShrink: 0 }),
    [sidebarOpen, sidebarWidth],
  )
  const rightPanelStyle = useMemo<React.CSSProperties>(
    () => ({ width: rightPanelWidth, flexShrink: 0 }),
    [rightPanelWidth],
  )

  // Derive a stable session ID list — only changes when sessions are added/removed,
  // not when session status updates (which create a new sessions object)
  const sessionIds = useAppStore((s) => {
    const ids = Object.keys(s.sessions)
    return ids.join(',')
  })
  const sessionIdList = useMemo(() => (sessionIds ? sessionIds.split(',') : []), [sessionIds])

  const [aboutOpen, setAboutOpen] = useState(false)
  const openAbout = useCallback(() => setAboutOpen(true), [])
  const closeAbout = useCallback(() => setAboutOpen(false), [])

  const { updateProject } = useProjects()

  const handleOpenProject = useCallback(
    (project: Project) => {
      const sessionId = `session-${project.id}-${Date.now()}`
      addSession(sessionId, project.id)
      void updateProject({ ...project, lastOpened: Date.now() }).catch(() => {})
    },
    [addSession, updateProject],
  )

  const handleCloseTab = useCallback(
    (sessionId: string) => {
      // Kill PTY immediately on explicit close — don't rely only on
      // TerminalPane cleanup which may race with React's unmount timing.
      window.agentDeck.pty.kill(sessionId).catch(() => {})
      removeSession(sessionId)
    },
    [removeSession],
  )

  const handleAddTab = useCallback(() => {
    useAppStore.getState().openCommandPalette()
  }, [])

  const handleCloseWorkflowTab = useCallback((workflowId: string) => {
    useAppStore.getState().closeWorkflow(workflowId)
  }, [])

  // Spotlight cursor effect
  const spotlightRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (spotlightRef.current) {
        spotlightRef.current.style.left = `${e.clientX}px`
        spotlightRef.current.style.top = `${e.clientY}px`
      }
    }
    window.addEventListener('mousemove', handler)
    return () => window.removeEventListener('mousemove', handler)
  }, [])

  // File drag-and-drop: preload handles the DOM drop event (File.path is only
  // available in the preload world with contextIsolation). Main process converts
  // paths to WSL and sends them here via IPC.
  useEffect(() => {
    const unsub = window.agentDeck.onFileDrop((wslPaths: string[]) => {
      const state = useAppStore.getState()
      if (state.currentView !== 'session') return
      const sid = state.paneSessions[state.focusedPane]
      if (!sid) return
      const escaped = wslPaths.map((p) => (p.includes(' ') ? `"${p}"` : p)).join(' ')
      window.agentDeck.pty.write(sid, escaped)
    })
    return unsub
  }, [])

  // Load saved zoom level on mount
  useEffect(() => {
    window.agentDeck.zoom
      .get()
      .then((factor) => {
        useAppStore.getState().setZoomFactor(factor)
      })
      .catch((err: unknown) => {
        window.agentDeck.log.send('warn', 'app', 'Failed to load zoom', { err: String(err) })
      })
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      // Zoom shortcuts
      if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        const current = useAppStore.getState().zoomFactor
        window.agentDeck.zoom
          .set(current + 0.1)
          .then((z) => useAppStore.getState().setZoomFactor(z))
          .catch(() => {})
        return
      }
      if (e.ctrlKey && e.key === '-') {
        e.preventDefault()
        const current = useAppStore.getState().zoomFactor
        window.agentDeck.zoom
          .set(current - 0.1)
          .then((z) => useAppStore.getState().setZoomFactor(z))
          .catch(() => {})
        return
      }
      if (e.ctrlKey && e.key === '0') {
        e.preventDefault()
        window.agentDeck.zoom
          .reset()
          .then((z) => useAppStore.getState().setZoomFactor(z))
          .catch(() => {})
        return
      }
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        const state = useAppStore.getState()
        if (state.commandPaletteOpen) {
          state.closeCommandPalette()
        } else {
          state.openCommandPalette()
        }
        return
      }
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        useAppStore.getState().openWizard()
        return
      }
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault()
        useAppStore.getState().toggleSidebar()
        return
      }
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault()
        useAppStore.getState().toggleRightPanel()
        return
      }
      if (e.ctrlKey && (e.key === '1' || e.key === '2' || e.key === '3')) {
        e.preventDefault()
        useAppStore.getState().setPaneLayout(Number(e.key) as 1 | 2 | 3)
        return
      }
      if (e.key === 'Escape') {
        const state = useAppStore.getState()
        if (state.commandPaletteOpen) {
          // Let the CommandPalette's own capture-phase handler close it
          return
        }
        if (state.currentView === 'wizard') {
          state.closeWizard()
        } else if (state.currentView === 'settings') {
          state.closeSettings()
        } else if (state.currentView === 'template-editor') {
          state.closeTemplateEditor()
        } else {
          // Toggle command palette open with Escape
          state.openCommandPalette()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Subscribe to PTY activity events for all active sessions (ref-based to avoid re-subscribing)
  const subscribedRef = useRef<Map<string, () => void>>(new Map())

  useEffect(() => {
    const subscriptions = subscribedRef.current
    // Subscribe to new sessions only
    for (const sid of sessionIdList) {
      if (!subscriptions.has(sid)) {
        const unsub = window.agentDeck.pty.onActivity(sid, (event: ActivityEvent) => {
          useAppStore.getState().addActivityEvent(sid, event)
        })
        subscriptions.set(sid, unsub)
      }
    }
    // Unsubscribe from removed sessions
    for (const [sid, unsub] of subscriptions) {
      if (!sessionIdList.includes(sid)) {
        unsub()
        subscriptions.delete(sid)
      }
    }
    return () => {
      for (const unsub of subscriptions.values()) unsub()
      subscriptions.clear()
    }
  }, [sessionIdList])

  return (
    <div className="app">
      <div className="spotlight" ref={spotlightRef} />
      <Titlebar
        onCloseTab={handleCloseTab}
        onCloseWorkflowTab={handleCloseWorkflowTab}
        onAddTab={handleAddTab}
      />
      <div className="app-body">
        <div
          ref={sidebarRef}
          className={`sidebar-wrapper${sidebarOpen ? '' : ' collapsed'}`}
          style={sidebarStyle}
        >
          <Sidebar onOpenProject={handleOpenProject} />
        </div>
        {sidebarOpen && (
          <PanelDivider
            side="left"
            panelRef={sidebarRef}
            minWidth={160}
            maxWidth={400}
            onResizeEnd={setSidebarWidth}
          />
        )}
        <div className="app-main">
          {currentView === 'home' && <HomeScreen onOpenProject={handleOpenProject} />}
          <Suspense fallback={null}>
            {currentView === 'wizard' && <NewProjectWizard onCreateProject={handleOpenProject} />}
            {currentView === 'settings' && <ProjectSettings key={settingsProjectId} />}
            {currentView === 'template-editor' && <TemplateEditor />}
            {currentView === 'workflow' && activeWorkflowId && (
              <WorkflowEditor key={activeWorkflowId} workflowId={activeWorkflowId} />
            )}
          </Suspense>
          <div
            className={`view-panel ${currentView === 'session' ? 'view-panel--visible' : 'view-panel--hidden'}`}
          >
            <SplitView />
            {rightPanelOpen && (
              <>
                <PanelDivider
                  side="right"
                  panelRef={rightPanelRef}
                  minWidth={180}
                  maxWidth={500}
                  onResizeEnd={setRightPanelWidth}
                />
                <div ref={rightPanelRef} style={rightPanelStyle}>
                  <RightPanel />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <StatusBar onAboutClick={openAbout} />
      <CommandPalette onOpenProject={handleOpenProject} onAbout={openAbout} />
      {aboutOpen && <AboutDialog onClose={closeAbout} />}
      <NotificationToast />
    </div>
  )
}
