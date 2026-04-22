import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Titlebar } from './components/Titlebar/Titlebar'
import { TopTabBar } from './components/TopTabBar/TopTabBar'
import { SessionsScreen } from './screens/SessionsScreen/SessionsScreen'
import { AgentsScreen } from './screens/AgentsScreen/AgentsScreen'
import { AlertsScreen } from './screens/AlertsScreen/AlertsScreen'
import { AppSettingsScreen } from './screens/AppSettingsScreen/AppSettingsScreen'
import { WorkflowsScreen } from './screens/WorkflowsScreen/WorkflowsScreen'
import { Sidebar } from './components/Sidebar/Sidebar'
import { StatusBar } from './components/StatusBar/StatusBar'
import { HomeScreen } from './components/HomeScreen/HomeScreen'
import { SplitView } from './components/SplitView/SplitView'
import { RightPanel } from './components/RightPanel/RightPanel'
import { PanelDivider } from './components/shared/PanelDivider'
import { CommandPalette } from './components/CommandPalette/CommandPalette'
import { AboutDialog } from './components/AboutDialog/AboutDialog'
import { ShortcutsDialog } from './components/ShortcutsDialog/ShortcutsDialog'
import { NotificationToast } from './components/NotificationToast/NotificationToast'
import { ConfirmDialog } from './components/shared/ConfirmDialog'
import { PlaceholderScreen } from './components/PlaceholderScreen/PlaceholderScreen'
import { useAppStore } from './store/appStore'
import { useProjects } from './hooks/useProjects'
import type { ActivityEvent, AgentConfig, Project, ViewType, WorkflowEvent } from '../shared/types'
import './App.css'

/** Top-level tabs that should hide the contextual sidebar. */
const SIDEBAR_HIDDEN_VIEWS: readonly ViewType[] = [
  'agents',
  'history',
  'alerts',
  'app-settings',
  'new-session',
  'diff',
]

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

  // Stable list of currently-open workflow tabs (joined string for shallow eq)
  const openWorkflowIdsStr = useAppStore((s) => s.openWorkflowIds.join(','))
  const openWorkflowIdList = useMemo(
    () => (openWorkflowIdsStr ? openWorkflowIdsStr.split(',') : []),
    [openWorkflowIdsStr],
  )

  const [aboutOpen, setAboutOpen] = useState(false)
  const openAbout = useCallback(() => setAboutOpen(true), [])
  const closeAbout = useCallback(() => setAboutOpen(false), [])

  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const openShortcuts = useCallback(() => setShortcutsOpen(true), [])
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), [])

  const [worktreeCloseDialog, setWorktreeCloseDialog] = useState<{
    sessionId: string
    branch: string
    message: string
  } | null>(null)

  const handleNewTerminal = useCallback(() => {
    const sessionId = `terminal-${Date.now()}`
    addSession(sessionId, '')
  }, [addSession])

  const { updateProject } = useProjects()

  const handleOpenProject = useCallback(
    (project: Project) => {
      const sessionId = `session-${project.id}-${Date.now()}`
      addSession(sessionId, project.id)
      void updateProject({ ...project, lastOpened: Date.now() }).catch((err: unknown) => {
        window.agentDeck.log.send('warn', 'app', 'Failed to update lastOpened', {
          err: String(err),
        })
      })
    },
    [addSession, updateProject],
  )

  const handleOpenProjectWithAgent = useCallback(
    (project: Project, agentConfig: AgentConfig) => {
      const sessionId = `session-${project.id}-${Date.now()}`
      const overrides: { agentOverride: typeof agentConfig.agent; agentFlagsOverride?: string } = {
        agentOverride: agentConfig.agent,
      }
      if (agentConfig.agentFlags !== undefined) {
        overrides.agentFlagsOverride = agentConfig.agentFlags
      }
      addSession(sessionId, project.id, overrides)
      void updateProject({ ...project, lastOpened: Date.now() }).catch((err: unknown) => {
        window.agentDeck.log.send('warn', 'app', 'Failed to update lastOpened', {
          err: String(err),
        })
      })
    },
    [addSession, updateProject],
  )

  /** Kill PTY + remove session (non-worktree path, or after worktree cleanup). */
  const closeSessionImmediate = useCallback(
    (sessionId: string) => {
      window.agentDeck.pty.kill(sessionId).catch((err: unknown) => {
        window.agentDeck.log.send('debug', 'pty', 'Kill failed', { err: String(err) })
      })
      window.agentDeck.cost.unbind(sessionId).catch((err: unknown) => {
        window.agentDeck.log.send('debug', 'cost', 'unbind failed', { sessionId, err: String(err) })
      })
      removeSession(sessionId)
    },
    [removeSession],
  )

  const handleCloseTab = useCallback(
    (sessionId: string) => {
      // Read worktree state fresh from store to avoid stale closure
      const wt = useAppStore.getState().worktreePaths[sessionId]
      // Non-worktree session — release primary slot and close immediately.
      if (!wt?.isolated) {
        const projectId = useAppStore.getState().sessions[sessionId]?.projectId
        if (projectId) {
          window.agentDeck.worktree.releasePrimary(projectId, sessionId).catch((err: unknown) => {
            window.agentDeck.log.send('debug', 'worktree', 'releasePrimary failed', {
              err: String(err),
            })
          })
        }
        closeSessionImmediate(sessionId)
        return
      }

      // Worktree session — inspect before closing.
      window.agentDeck.worktree
        .inspect(sessionId)
        .then((result) => {
          if (result.hasChanges || result.hasUnmerged) {
            // Dirty worktree — show confirmation dialog.
            const parts: string[] = []
            if (result.hasChanges) parts.push('uncommitted changes')
            if (result.hasUnmerged) parts.push('unmerged commits')
            setWorktreeCloseDialog({
              sessionId,
              branch: result.branch,
              message: `Branch "${result.branch}" has ${parts.join(' and ')}.\nDiscard will delete the worktree and branch.`,
            })
          } else {
            // Clean worktree — discard silently.
            window.agentDeck.pty.kill(sessionId).catch((err: unknown) => {
              window.agentDeck.log.send('debug', 'pty', 'Kill failed', { err: String(err) })
            })
            window.agentDeck.cost.unbind(sessionId).catch((err: unknown) => {
              window.agentDeck.log.send('debug', 'cost', 'unbind failed', {
                sessionId,
                err: String(err),
              })
            })
            window.agentDeck.worktree.discard(sessionId).catch((err: unknown) => {
              useAppStore
                .getState()
                .addNotification(
                  'warning',
                  'Failed to clean up worktree — it may need manual removal',
                )
              window.agentDeck.log.send('warn', 'worktree', 'Discard failed', {
                err: String(err),
              })
            })
            useAppStore.getState().clearWorktreePath(sessionId)
            removeSession(sessionId)
          }
        })
        .catch((err: unknown) => {
          // Inspect failed — fall back to normal close to avoid blocking.
          window.agentDeck.log.send('warn', 'worktree', 'Inspect failed, closing anyway', {
            err: String(err),
          })
          closeSessionImmediate(sessionId)
        })
    },
    [removeSession, closeSessionImmediate],
  )

  /** Worktree dialog: "Discard" — delete branch + worktree. */
  const handleWorktreeDiscard = useCallback(() => {
    if (!worktreeCloseDialog) return
    const { sessionId } = worktreeCloseDialog
    window.agentDeck.pty.kill(sessionId).catch((err: unknown) => {
      window.agentDeck.log.send('debug', 'pty', 'Kill failed', { err: String(err) })
    })
    window.agentDeck.cost.unbind(sessionId).catch((err: unknown) => {
      window.agentDeck.log.send('debug', 'cost', 'unbind failed', { sessionId, err: String(err) })
    })
    window.agentDeck.worktree.discard(sessionId).catch((err: unknown) => {
      useAppStore
        .getState()
        .addNotification('warning', 'Failed to clean up worktree — it may need manual removal')
      window.agentDeck.log.send('warn', 'worktree', 'Discard failed', { err: String(err) })
    })
    useAppStore.getState().clearWorktreePath(sessionId)
    removeSession(sessionId)
    setWorktreeCloseDialog(null)
  }, [worktreeCloseDialog, removeSession])

  /** Worktree dialog: "Keep Branch" — preserve branch, remove worktree. */
  const handleWorktreeKeep = useCallback(() => {
    if (!worktreeCloseDialog) return
    const { sessionId } = worktreeCloseDialog
    window.agentDeck.pty.kill(sessionId).catch((err: unknown) => {
      window.agentDeck.log.send('debug', 'pty', 'Kill failed', { err: String(err) })
    })
    window.agentDeck.cost.unbind(sessionId).catch((err: unknown) => {
      window.agentDeck.log.send('debug', 'cost', 'unbind failed', { sessionId, err: String(err) })
    })
    window.agentDeck.worktree.keep(sessionId).catch((err: unknown) => {
      window.agentDeck.log.send('warn', 'worktree', 'Keep failed', { err: String(err) })
    })
    useAppStore.getState().clearWorktreePath(sessionId)
    removeSession(sessionId)
    setWorktreeCloseDialog(null)
  }, [worktreeCloseDialog, removeSession])

  /** Worktree dialog: "Cancel" — abort close, keep session alive. */
  const handleWorktreeCancel = useCallback(() => {
    setWorktreeCloseDialog(null)
  }, [])

  const handleAddTab = useCallback(() => {
    useAppStore.getState().openCommandPalette()
  }, [])

  const handleCloseWorkflowTab = useCallback((workflowId: string) => {
    useAppStore.getState().closeWorkflow(workflowId)
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
      const escaped = wslPaths.map((p) => `'${p.replace(/'/g, "'\\''")}'`).join(' ')
      window.agentDeck.pty.write(sid, escaped)
    })
    return unsub
  }, [])

  // Hydrate workflow execution state from main process on mount (REL-8)
  useEffect(() => {
    window.agentDeck.workflows
      .getRunning()
      .then((ids) => {
        const store = useAppStore.getState()
        for (const id of ids) {
          store.setWorkflowStatus(id, 'running')
        }
      })
      .catch((err: unknown) => {
        window.agentDeck.log.send('warn', 'app', 'Failed to hydrate workflow state', {
          err: String(err),
        })
      })
  }, [])

  // Listen for WSL status from main process
  const wslAvailable = useAppStore((s) => s.wslAvailable)
  useEffect(() => {
    const unsub = window.agentDeck.wsl.onStatus((data) => {
      useAppStore.getState().setWslAvailable(data.available)
    })
    return unsub
  }, [])

  // Listen for cost/token usage updates from main process
  useEffect(() => {
    const unsub = window.agentDeck.cost.onUpdate((data) => {
      useAppStore.getState().setSessionUsage(data.sessionId, data.usage)
    })
    return unsub
  }, [])

  // Listen for encryption unavailability warning
  useEffect(() => {
    const unsub = window.agentDeck.security.onEncryptionUnavailable(() => {
      useAppStore
        .getState()
        .addNotification('warning', 'Encryption unavailable — API keys are stored as plaintext')
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
          .catch((err: unknown) => {
            window.agentDeck.log.send('warn', 'app', 'Zoom IPC failed', { err: String(err) })
          })
        return
      }
      if (e.ctrlKey && e.key === '-') {
        e.preventDefault()
        const current = useAppStore.getState().zoomFactor
        window.agentDeck.zoom
          .set(current - 0.1)
          .then((z) => useAppStore.getState().setZoomFactor(z))
          .catch((err: unknown) => {
            window.agentDeck.log.send('warn', 'app', 'Zoom IPC failed', { err: String(err) })
          })
        return
      }
      if (e.ctrlKey && e.key === '0') {
        e.preventDefault()
        window.agentDeck.zoom
          .reset()
          .then((z) => useAppStore.getState().setZoomFactor(z))
          .catch((err: unknown) => {
            window.agentDeck.log.send('warn', 'app', 'Zoom IPC failed', { err: String(err) })
          })
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
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault()
        handleNewTerminal()
        return
      }
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault()
        useAppStore.getState().toggleSidebar()
        return
      }
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault()
        setShortcutsOpen((prev) => !prev)
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
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        const state = useAppStore.getState()
        const ids = Object.entries(state.sessions)
          .filter(([, s]) => s.status !== 'exited')
          .map(([id]) => id)
        if (ids.length === 0) return
        const currentIdx = state.activeSessionId ? ids.indexOf(state.activeSessionId) : -1
        const next = e.shiftKey
          ? (currentIdx - 1 + ids.length) % ids.length
          : (currentIdx + 1) % ids.length
        const nextId = ids[next]
        if (nextId) state.setActiveSession(nextId)
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
  }, [handleNewTerminal])

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

  // Subscribe to workflow execution events for all open workflow tabs.
  // Lifted out of WorkflowEditor so leaving + returning to the tab doesn't
  // tear down the IPC listener and lose events that fire during the gap
  // (which would freeze the per-node animations on return).
  const workflowSubscribedRef = useRef<Map<string, () => void>>(new Map())

  useEffect(() => {
    const subscriptions = workflowSubscribedRef.current
    for (const wfId of openWorkflowIdList) {
      if (!subscriptions.has(wfId)) {
        const unsub = window.agentDeck.workflows.onEvent(wfId, (event: WorkflowEvent) => {
          const s = useAppStore.getState()
          s.addWorkflowLog(wfId, event)
          const nid = event.nodeId
          switch (event.type) {
            case 'workflow:started':
              s.setWorkflowStatus(wfId, 'running')
              break
            case 'workflow:done':
              s.setWorkflowStatus(wfId, 'done')
              break
            case 'workflow:error':
              s.setWorkflowStatus(wfId, 'error')
              break
            case 'workflow:stopped':
              s.setWorkflowStatus(wfId, 'stopped')
              break
            case 'node:started':
            case 'node:resumed':
              if (nid) s.setWorkflowNodeStatus(wfId, nid, 'running')
              break
            case 'node:done':
              if (nid) s.setWorkflowNodeStatus(wfId, nid, 'done')
              break
            case 'node:error':
              if (nid) s.setWorkflowNodeStatus(wfId, nid, 'error')
              break
            case 'node:paused':
              if (nid) s.setWorkflowNodeStatus(wfId, nid, 'paused')
              break
            case 'node:skipped':
              if (nid) s.setWorkflowNodeStatus(wfId, nid, 'skipped')
              break
            // node:retry / node:loopIteration are logged only
          }
        })
        subscriptions.set(wfId, unsub)
      }
    }
    for (const [wfId, unsub] of subscriptions) {
      if (!openWorkflowIdList.includes(wfId)) {
        unsub()
        subscriptions.delete(wfId)
      }
    }
    return () => {
      for (const unsub of subscriptions.values()) unsub()
      subscriptions.clear()
    }
  }, [openWorkflowIdList])

  const sidebarHidden = SIDEBAR_HIDDEN_VIEWS.includes(currentView)

  return (
    <div className="app">
      <Titlebar
        onCloseTab={handleCloseTab}
        onCloseWorkflowTab={handleCloseWorkflowTab}
        onAddTab={handleAddTab}
      />
      <TopTabBar />
      <div className="app-body">
        {wslAvailable === false && (
          <div className="wsl-warning-banner" role="alert">
            WSL not detected — check that your distribution is running
          </div>
        )}
        {!sidebarHidden && (
          <>
            <div
              ref={sidebarRef}
              className={`sidebar-wrapper${sidebarOpen ? '' : ' collapsed'}`}
              style={sidebarStyle}
            >
              <Sidebar
                onOpenProject={handleOpenProject}
                onOpenProjectWithAgent={handleOpenProjectWithAgent}
              />
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
          </>
        )}
        <div className="app-main">
          {currentView === 'home' && (
            <HomeScreen
              onOpenProject={handleOpenProject}
              onOpenProjectWithAgent={handleOpenProjectWithAgent}
            />
          )}
          {currentView === 'sessions' && <SessionsScreen />}
          {currentView === 'projects' && (
            <PlaceholderScreen
              phase="Phase 3.5"
              title="Projects"
              subtitle="Browse and pin projects. Detection of stack + agents, last activity, dirty-branch badges."
            />
          )}
          {currentView === 'project-detail' && (
            <PlaceholderScreen
              phase="Phase 3.5"
              title="Project Detail"
              subtitle="Single-project overview with sessions, settings entry point, and recent activity."
            />
          )}
          {currentView === 'agents' && <AgentsScreen />}
          {currentView === 'workflows' && !activeWorkflowId && <WorkflowsScreen />}
          {currentView === 'history' && (
            <PlaceholderScreen
              phase="Phase 3.9"
              title="History"
              subtitle="14-day heatmap of session cost and count, plus paginated archive."
            />
          )}
          {currentView === 'alerts' && <AlertsScreen />}
          {currentView === 'app-settings' && <AppSettingsScreen />}
          {currentView === 'new-session' && (
            <PlaceholderScreen
              phase="Phase 3.4"
              title="New Session"
              subtitle="Composer to launch an agent against an existing project: template, prompt, mode, launch card."
            />
          )}
          {currentView === 'diff' && (
            <PlaceholderScreen
              phase="Phase 3.8"
              title="Diff Review"
              subtitle="File tree + unified diff + per-file comments. Keep / Discard / Request changes."
            />
          )}
          <Suspense fallback={<div className="suspense-spinner" />}>
            {currentView === 'wizard' && <NewProjectWizard onCreateProject={handleOpenProject} />}
            {currentView === 'settings' && <ProjectSettings key={settingsProjectId} />}
            {currentView === 'template-editor' && <TemplateEditor />}
            {(currentView === 'workflow' || (currentView === 'workflows' && activeWorkflowId)) &&
              activeWorkflowId && (
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
      <StatusBar onAboutClick={openAbout} onShortcutsClick={openShortcuts} />
      <CommandPalette
        onOpenProject={handleOpenProject}
        onAbout={openAbout}
        onShortcuts={openShortcuts}
        onNewTerminal={handleNewTerminal}
      />
      {aboutOpen && <AboutDialog onClose={closeAbout} />}
      {shortcutsOpen && <ShortcutsDialog onClose={closeShortcuts} />}
      <ConfirmDialog
        open={worktreeCloseDialog !== null}
        title="Close Worktree Session"
        message={worktreeCloseDialog?.message ?? ''}
        confirmLabel="Discard"
        onConfirm={handleWorktreeDiscard}
        onCancel={handleWorktreeCancel}
        extraAction={{ label: 'Keep Branch', onClick: handleWorktreeKeep }}
      />
      <NotificationToast />
    </div>
  )
}
