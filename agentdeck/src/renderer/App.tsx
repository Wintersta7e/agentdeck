import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Titlebar } from './components/Titlebar/Titlebar'
import { Sidebar } from './components/Sidebar/Sidebar'
import { StatusBar } from './components/StatusBar/StatusBar'
import { HomeScreen } from './components/HomeScreen/HomeScreen'
import { SplitView } from './components/SplitView/SplitView'
import { RightPanel } from './components/RightPanel/RightPanel'
import { NewProjectWizard } from './components/NewProjectWizard/NewProjectWizard'
import { ProjectSettings } from './components/ProjectSettings/ProjectSettings'
import { CommandPalette } from './components/CommandPalette/CommandPalette'
import { TemplateEditor } from './components/TemplateEditor/TemplateEditor'
import { AboutDialog } from './components/AboutDialog/AboutDialog'
import { useAppStore } from './store/appStore'
import { useProjects } from './hooks/useProjects'
import type { ActivityEvent, Project } from '../shared/types'
import './App.css'

export function App(): React.JSX.Element {
  const currentView = useAppStore((s) => s.currentView)
  const addSession = useAppStore((s) => s.addSession)
  const removeSession = useAppStore((s) => s.removeSession)

  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen)
  const sessions = useAppStore((s) => s.sessions)
  const sessionIds = useMemo(() => Object.keys(sessions), [sessions])

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

  // Load saved zoom level on mount
  useEffect(() => {
    window.agentDeck.zoom.get().then((factor) => {
      useAppStore.getState().setZoomFactor(factor)
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
        return
      }
      if (e.ctrlKey && e.key === '-') {
        e.preventDefault()
        const current = useAppStore.getState().zoomFactor
        window.agentDeck.zoom
          .set(current - 0.1)
          .then((z) => useAppStore.getState().setZoomFactor(z))
        return
      }
      if (e.ctrlKey && e.key === '0') {
        e.preventDefault()
        window.agentDeck.zoom.reset().then((z) => useAppStore.getState().setZoomFactor(z))
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
    for (const sid of sessionIds) {
      if (!subscriptions.has(sid)) {
        const unsub = window.agentDeck.pty.onActivity(sid, (event: ActivityEvent) => {
          useAppStore.getState().addActivityEvent(sid, event)
        })
        subscriptions.set(sid, unsub)
      }
    }
    // Unsubscribe from removed sessions
    for (const [sid, unsub] of subscriptions) {
      if (!sessionIds.includes(sid)) {
        unsub()
        subscriptions.delete(sid)
      }
    }
    return () => {
      for (const unsub of subscriptions.values()) unsub()
      subscriptions.clear()
    }
  }, [sessionIds])

  return (
    <div className="app">
      <Titlebar onCloseTab={handleCloseTab} onAddTab={handleAddTab} />
      <div className="app-body">
        <Sidebar onOpenProject={handleOpenProject} />
        <div className="app-main">
          {currentView === 'home' && <HomeScreen onOpenProject={handleOpenProject} />}
          {currentView === 'wizard' && <NewProjectWizard onCreateProject={handleOpenProject} />}
          {currentView === 'settings' && (
            <ProjectSettings key={useAppStore.getState().settingsProjectId} />
          )}
          {currentView === 'template-editor' && <TemplateEditor />}
          <div
            style={{
              display: currentView === 'session' ? 'flex' : 'none',
              flex: 1,
              overflow: 'hidden',
            }}
          >
            <SplitView />
            {rightPanelOpen && <RightPanel />}
          </div>
        </div>
      </div>
      <StatusBar onAboutClick={openAbout} />
      <CommandPalette onOpenProject={handleOpenProject} onAbout={openAbout} />
      {aboutOpen && <AboutDialog onClose={closeAbout} />}
    </div>
  )
}
