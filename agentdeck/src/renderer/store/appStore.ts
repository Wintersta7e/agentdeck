import { create } from 'zustand'
import type {
  Project,
  Template,
  Session,
  SessionStatus,
  ViewType,
  PaneLayout,
  RightPanelTab,
  ActivityEvent,
  WorkflowMeta,
  WorkflowEvent,
  WorkflowNodeStatus,
  WorkflowStatus,
} from '../../shared/types'

interface AppState {
  sessions: Record<string, Session>
  activeSessionId: string | null
  addSession: (sessionId: string, projectId: string) => void
  setSessionStatus: (sessionId: string, status: SessionStatus) => void
  setActiveSession: (sessionId: string) => void
  removeSession: (sessionId: string) => void
  restartSession: (oldSessionId: string) => string | null

  currentView: ViewType
  setCurrentView: (view: ViewType) => void

  settingsProjectId: string | null
  viewStack: ViewType[]

  openWizard: () => void
  closeWizard: () => void
  openSettings: (projectId: string) => void
  closeSettings: () => void

  projects: Project[]
  setProjects: (projects: Project[]) => void

  templates: Template[]
  setTemplates: (templates: Template[]) => void

  getSessionForProject: (projectId: string) => Session | undefined

  // Split View
  paneLayout: PaneLayout
  focusedPane: number
  paneSessions: string[]
  setPaneLayout: (layout: PaneLayout) => void
  cyclePaneLayout: () => void
  setFocusedPane: (pane: number) => void
  setPaneSession: (paneIndex: number, sessionId: string) => void

  // Command Palette
  commandPaletteOpen: boolean
  commandPaletteInitialSubMenu: 'theme' | 'agents' | null
  openCommandPalette: (subMenu?: 'theme' | 'agents') => void
  closeCommandPalette: () => void

  // Right Panel
  rightPanelOpen: boolean
  rightPanelTab: RightPanelTab
  toggleRightPanel: () => void
  setRightPanelTab: (tab: RightPanelTab) => void

  // Activity Feed (per-session)
  activityFeeds: Record<string, ActivityEvent[]>
  addActivityEvent: (sessionId: string, event: ActivityEvent) => void
  clearActivityFeed: (sessionId: string) => void

  // Template Editor
  editingTemplateId: string | null
  openTemplateEditor: (templateId?: string) => void
  closeTemplateEditor: () => void

  // Workflows
  workflows: WorkflowMeta[]
  setWorkflows: (w: WorkflowMeta[]) => void
  updateWorkflowMeta: (id: string, patch: Partial<WorkflowMeta>) => void
  editingWorkflowId: string | null
  openWorkflow: (id: string) => void
  closeWorkflow: () => void

  // Workflow execution state (keyed by workflowId, survives editor remount)
  workflowLogs: Record<string, WorkflowEvent[]>
  workflowNodeStatuses: Record<string, Record<string, WorkflowNodeStatus>>
  workflowStatuses: Record<string, WorkflowStatus>
  addWorkflowLog: (workflowId: string, event: WorkflowEvent) => void
  setWorkflowNodeStatus: (workflowId: string, nodeId: string, status: WorkflowNodeStatus) => void
  setWorkflowStatus: (workflowId: string, status: WorkflowStatus) => void
  clearWorkflowLogs: (workflowId: string) => void
  resetWorkflowExecution: (workflowId: string) => void

  // Layout (sidebar + panels)
  sidebarOpen: boolean
  sidebarWidth: number
  sidebarSections: { pinned: boolean; templates: boolean; workflows: boolean }
  rightPanelWidth: number
  wfLogPanelWidth: number
  toggleSidebar: () => void
  setSidebarWidth: (w: number) => void
  toggleSidebarSection: (key: 'pinned' | 'templates' | 'workflows') => void
  setRightPanelWidth: (w: number) => void
  setWfLogPanelWidth: (w: number) => void

  // Zoom
  zoomFactor: number
  setZoomFactor: (factor: number) => void

  // Theme
  theme: string
  setTheme: (name: string) => void

  // Visible Agents (home screen)
  visibleAgents: string[] | null
  setVisibleAgents: (agents: string[]) => void

  // Notifications
  notifications: Array<{
    id: string
    type: 'error' | 'warning' | 'info'
    message: string
    timestamp: number
  }>
  addNotification: (type: 'error' | 'warning' | 'info', message: string) => void
  dismissNotification: (id: string) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  sessions: {},
  activeSessionId: null,

  addSession: (sessionId, projectId) =>
    set((state) => {
      const paneSessions = [...state.paneSessions]
      // Place new session in the focused pane so it's always visible
      const targetPane = state.focusedPane
      while (paneSessions.length <= targetPane) {
        paneSessions.push('')
      }
      paneSessions[targetPane] = sessionId
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { id: sessionId, projectId, status: 'starting', startedAt: Date.now() },
        },
        activeSessionId: sessionId,
        currentView: 'session' as const,
        paneSessions,
      }
    }),

  setSessionStatus: (sessionId, status) =>
    set((state) => {
      const existing = state.sessions[sessionId]
      if (!existing) return state
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...existing, status },
        },
      }
    }),

  setActiveSession: (sessionId) =>
    set((state) => {
      const paneSessions = [...state.paneSessions]
      // If session isn't already in a visible pane, put it in the focused pane
      const visibleIndex = paneSessions.slice(0, state.paneLayout).indexOf(sessionId)
      if (visibleIndex === -1) {
        const targetPane = state.focusedPane
        while (paneSessions.length <= targetPane) {
          paneSessions.push('')
        }
        paneSessions[targetPane] = sessionId
      }
      return { activeSessionId: sessionId, currentView: 'session' as const, paneSessions }
    }),

  removeSession: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...rest } = state.sessions
      const { [sessionId]: _feed, ...remainingFeeds } = state.activityFeeds
      const remainingIds = Object.keys(rest)
      // Clear removed session from pane slots, then compact left so pane 0 always
      // has a session if any exist (prevents empty pane with sessions in hidden slots)
      const cleared = state.paneSessions.map((id) => (id === sessionId ? '' : id))
      const filled = cleared.filter((id) => id !== '')
      const paneSessions = [...filled, ...Array<string>(cleared.length - filled.length).fill('')]
      const firstPane = paneSessions[0]
      const newActive = firstPane && firstPane !== '' ? firstPane : (remainingIds[0] ?? null)
      // If pane 0 is empty but we still have sessions, place the new active there
      if (paneSessions[0] === '' && newActive) {
        paneSessions[0] = newActive
      }
      return {
        sessions: rest,
        activityFeeds: remainingFeeds,
        activeSessionId: state.activeSessionId === sessionId ? newActive : state.activeSessionId,
        currentView: remainingIds.length === 0 ? ('home' as const) : state.currentView,
        paneSessions,
      }
    }),

  restartSession: (oldSessionId) => {
    const state = get()
    const oldSession = state.sessions[oldSessionId]
    if (!oldSession) return null

    const projectId = oldSession.projectId
    const newSessionId = `session-${projectId}-${Date.now()}`

    // Find which pane slot the old session occupies
    const paneIndex = state.paneSessions.indexOf(oldSessionId)

    set((s) => {
      // Remove old session
      const { [oldSessionId]: _, ...rest } = s.sessions
      const { [oldSessionId]: _feed, ...remainingFeeds } = s.activityFeeds

      // Place new session in the same pane slot
      const paneSessions = s.paneSessions.map((id) => (id === oldSessionId ? newSessionId : id))
      if (paneIndex === -1) {
        // Old session wasn't in a pane — put new one in focused pane
        while (paneSessions.length <= s.focusedPane) paneSessions.push('')
        paneSessions[s.focusedPane] = newSessionId
      }

      return {
        sessions: {
          ...rest,
          [newSessionId]: {
            id: newSessionId,
            projectId,
            status: 'starting' as const,
            startedAt: Date.now(),
          },
        },
        activityFeeds: remainingFeeds,
        activeSessionId: newSessionId,
        paneSessions,
      }
    })

    return newSessionId
  },

  currentView: 'home',
  setCurrentView: (view) => set({ currentView: view }),

  settingsProjectId: null,
  viewStack: [] as ViewType[],

  openWizard: () =>
    set((state) => ({
      currentView: 'wizard' as const,
      viewStack: [...state.viewStack, state.currentView],
    })),
  closeWizard: () =>
    set((state) => {
      const stack = [...state.viewStack]
      const prev = stack.pop() ?? 'home'
      return { currentView: prev, viewStack: stack }
    }),
  openSettings: (projectId) =>
    set((state) => ({
      currentView: 'settings' as const,
      settingsProjectId: projectId,
      viewStack: [...state.viewStack, state.currentView],
    })),
  closeSettings: () =>
    set((state) => {
      const stack = [...state.viewStack]
      const prev = stack.pop() ?? 'home'
      return { currentView: prev, settingsProjectId: null, viewStack: stack }
    }),

  projects: [],
  setProjects: (projects) => set({ projects }),

  templates: [],
  setTemplates: (templates) => set({ templates }),

  getSessionForProject: (projectId) => {
    const { sessions } = get()
    return Object.values(sessions).find((s) => s.projectId === projectId)
  },

  // Split View
  paneLayout: 1,
  focusedPane: 0,
  paneSessions: [],

  setPaneLayout: (layout) =>
    set((state) => ({
      paneLayout: layout,
      focusedPane: state.focusedPane >= layout ? 0 : state.focusedPane,
    })),

  cyclePaneLayout: () =>
    set((state) => {
      const next = (state.paneLayout === 3 ? 1 : state.paneLayout + 1) as PaneLayout
      return {
        paneLayout: next,
        focusedPane: state.focusedPane >= next ? 0 : state.focusedPane,
      }
    }),

  setFocusedPane: (pane) =>
    set((state) => ({
      focusedPane: pane < state.paneLayout ? pane : state.focusedPane,
    })),

  setPaneSession: (paneIndex, sessionId) =>
    set((state) => {
      const paneSessions = [...state.paneSessions]
      while (paneSessions.length <= paneIndex) {
        paneSessions.push('')
      }
      paneSessions[paneIndex] = sessionId
      return { paneSessions }
    }),

  // Command Palette
  commandPaletteOpen: false,
  commandPaletteInitialSubMenu: null,
  openCommandPalette: (subMenu) =>
    set({ commandPaletteOpen: true, commandPaletteInitialSubMenu: subMenu ?? null }),
  closeCommandPalette: () => set({ commandPaletteOpen: false, commandPaletteInitialSubMenu: null }),

  // Right Panel
  rightPanelOpen: false,
  rightPanelTab: 'context',
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),

  // Activity Feed
  activityFeeds: {},

  addActivityEvent: (sessionId, event) =>
    set((state) => {
      const existing = state.activityFeeds[sessionId] ?? []
      const updated = [...existing, event].slice(-500)
      return {
        activityFeeds: { ...state.activityFeeds, [sessionId]: updated },
      }
    }),

  clearActivityFeed: (sessionId) =>
    set((state) => ({
      activityFeeds: {
        ...state.activityFeeds,
        [sessionId]: [],
      },
    })),

  // Template Editor
  editingTemplateId: null,

  openTemplateEditor: (templateId) =>
    set((state) => ({
      currentView: 'template-editor' as const,
      viewStack: [...state.viewStack, state.currentView],
      editingTemplateId: templateId ?? null,
    })),

  closeTemplateEditor: () =>
    set((state) => {
      const stack = [...state.viewStack]
      const prev = stack.pop() ?? 'home'
      return { currentView: prev, editingTemplateId: null, viewStack: stack }
    }),

  // Workflows
  workflows: [],
  setWorkflows: (w) => set({ workflows: w }),
  updateWorkflowMeta: (id, patch) =>
    set((state) => ({
      workflows: state.workflows.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    })),
  editingWorkflowId: null,

  openWorkflow: (id) =>
    set((state) => ({
      currentView: 'workflow' as ViewType,
      editingWorkflowId: id,
      viewStack: [...state.viewStack, state.currentView],
    })),

  closeWorkflow: () =>
    set((state) => ({
      currentView: state.viewStack[state.viewStack.length - 1] ?? 'home',
      editingWorkflowId: null,
      viewStack: state.viewStack.slice(0, -1),
    })),

  // Workflow execution state (keyed by workflowId)
  workflowLogs: {},
  workflowNodeStatuses: {},
  workflowStatuses: {},

  addWorkflowLog: (workflowId, event) =>
    set((state) => {
      const existing = state.workflowLogs[workflowId] ?? []
      return {
        workflowLogs: {
          ...state.workflowLogs,
          [workflowId]: [...existing, event].slice(-1000),
        },
      }
    }),

  setWorkflowNodeStatus: (workflowId, nodeId, status) =>
    set((state) => ({
      workflowNodeStatuses: {
        ...state.workflowNodeStatuses,
        [workflowId]: { ...(state.workflowNodeStatuses[workflowId] ?? {}), [nodeId]: status },
      },
    })),

  setWorkflowStatus: (workflowId, status) =>
    set((state) => ({
      workflowStatuses: { ...state.workflowStatuses, [workflowId]: status },
    })),

  clearWorkflowLogs: (workflowId) =>
    set((state) => ({
      workflowLogs: { ...state.workflowLogs, [workflowId]: [] },
    })),

  resetWorkflowExecution: (workflowId) =>
    set((state) => ({
      workflowLogs: { ...state.workflowLogs, [workflowId]: [] },
      workflowNodeStatuses: { ...state.workflowNodeStatuses, [workflowId]: {} },
      workflowStatuses: { ...state.workflowStatuses, [workflowId]: 'idle' },
    })),

  // Layout (sidebar + panels)
  sidebarOpen: true,
  sidebarWidth: 220,
  sidebarSections: { pinned: true, templates: true, workflows: true },
  rightPanelWidth: 260,
  wfLogPanelWidth: 320,

  toggleSidebar: () => {
    const next = !get().sidebarOpen
    set({ sidebarOpen: next })
    window.agentDeck.layout.set({ sidebarOpen: next })
  },

  setSidebarWidth: (w) => {
    set({ sidebarWidth: w })
    window.agentDeck.layout.set({ sidebarWidth: w })
  },

  toggleSidebarSection: (key) => {
    const sections = { ...get().sidebarSections, [key]: !get().sidebarSections[key] }
    set({ sidebarSections: sections })
    window.agentDeck.layout.set({ sidebarSections: sections })
  },

  setRightPanelWidth: (w) => {
    set({ rightPanelWidth: w })
    window.agentDeck.layout.set({ rightPanelWidth: w })
  },

  setWfLogPanelWidth: (w) => {
    set({ wfLogPanelWidth: w })
    window.agentDeck.layout.set({ wfLogPanelWidth: w })
  },

  // Zoom
  zoomFactor: 1.0,
  setZoomFactor: (factor) => set({ zoomFactor: factor }),

  // Theme
  theme: document.documentElement.dataset.theme ?? '',
  setTheme: (name) => {
    document.documentElement.dataset.theme = name
    window.agentDeck.theme.set(name)
    set({ theme: name })
  },

  // Visible Agents
  visibleAgents: null,
  setVisibleAgents: (agents) => {
    window.agentDeck.agents.setVisible(agents)
    set({ visibleAgents: agents })
  },

  // Notifications
  notifications: [],

  addNotification: (type, message) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        {
          id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type,
          message,
          timestamp: Date.now(),
        },
      ].slice(-10),
    })),

  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}))
