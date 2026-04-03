import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from './appStore'
import { makeActivityEvent } from '../../__test__/helpers'

// Reset store to initial state between tests
beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
})

describe('Session lifecycle', () => {
  it('adds a session', () => {
    useAppStore.getState().addSession('s1', 'proj-1')
    const state = useAppStore.getState()
    expect(state.sessions['s1']).toBeDefined()
    expect(state.sessions['s1']?.projectId).toBe('proj-1')
    expect(state.sessions['s1']?.status).toBe('starting')
    expect(state.activeSessionId).toBe('s1')
    expect(state.currentView).toBe('session')
  })

  it('removes a session and falls back to home', () => {
    useAppStore.getState().addSession('s1', 'proj-1')
    useAppStore.getState().removeSession('s1')
    const state = useAppStore.getState()
    expect(state.sessions['s1']).toBeUndefined()
    expect(state.currentView).toBe('home')
  })

  it('removes a session with others remaining', () => {
    useAppStore.getState().addSession('s1', 'proj-1')
    useAppStore.getState().addSession('s2', 'proj-2')
    useAppStore.getState().removeSession('s1')
    const state = useAppStore.getState()
    expect(state.sessions['s1']).toBeUndefined()
    expect(state.sessions['s2']).toBeDefined()
  })

  it('updates session status', () => {
    useAppStore.getState().addSession('s1', 'proj-1')
    useAppStore.getState().setSessionStatus('s1', 'running')
    expect(useAppStore.getState().sessions['s1']?.status).toBe('running')
  })

  it('restarts a session', () => {
    useAppStore.getState().addSession('s1', 'proj-1')
    const newId = useAppStore.getState().restartSession('s1')
    expect(typeof newId).toBe('string')
    expect(newId).not.toBe('')
    const state = useAppStore.getState()
    expect(state.sessions['s1']).toBeUndefined()
    const newSession = newId ? state.sessions[newId] : undefined
    expect(newSession).toBeDefined()
    expect(newSession?.projectId).toBe('proj-1')
    expect(newSession?.status).toBe('starting')
  })

  it('places session in focused pane', () => {
    useAppStore.getState().addSession('s1', 'proj-1')
    const state = useAppStore.getState()
    expect(state.paneSessions[0]).toBe('s1')
  })

  it('adds a session with agent overrides', () => {
    useAppStore.getState().addSession('s1', 'proj-1', {
      agentOverride: 'aider',
      agentFlagsOverride: '--model gpt-4',
    })
    const session = useAppStore.getState().sessions['s1']
    expect(session?.agentOverride).toBe('aider')
    expect(session?.agentFlagsOverride).toBe('--model gpt-4')
  })

  it('adds a session without overrides (fields undefined)', () => {
    useAppStore.getState().addSession('s1', 'proj-1')
    const session = useAppStore.getState().sessions['s1']
    expect(session?.agentOverride).toBeUndefined()
    expect(session?.agentFlagsOverride).toBeUndefined()
  })

  it('restartSession preserves agent overrides', () => {
    useAppStore.getState().addSession('s1', 'proj-1', {
      agentOverride: 'codex',
      agentFlagsOverride: '--fast',
    })
    const newId = useAppStore.getState().restartSession('s1')
    expect(typeof newId).toBe('string')
    expect(newId).not.toBe('')
    const newSession = newId ? useAppStore.getState().sessions[newId] : undefined
    expect(newSession?.agentOverride).toBe('codex')
    expect(newSession?.agentFlagsOverride).toBe('--fast')
    expect(newSession?.status).toBe('starting')
  })
})

describe('View navigation', () => {
  it('opens and closes wizard via viewStack', () => {
    useAppStore.getState().openWizard()
    expect(useAppStore.getState().currentView).toBe('wizard')
    expect(useAppStore.getState().viewStack).toEqual(['home'])

    useAppStore.getState().closeWizard()
    expect(useAppStore.getState().currentView).toBe('home')
    expect(useAppStore.getState().viewStack).toEqual([])
  })

  it('opens and closes settings via viewStack', () => {
    useAppStore.getState().openSettings('proj-1')
    expect(useAppStore.getState().currentView).toBe('settings')
    expect(useAppStore.getState().settingsProjectId).toBe('proj-1')

    useAppStore.getState().closeSettings()
    expect(useAppStore.getState().currentView).toBe('home')
    expect(useAppStore.getState().settingsProjectId).toBeNull()
  })

  it('opens and closes template editor', () => {
    useAppStore.getState().openTemplateEditor('tmpl-1')
    expect(useAppStore.getState().currentView).toBe('template-editor')
    expect(useAppStore.getState().editingTemplateId).toBe('tmpl-1')

    useAppStore.getState().closeTemplateEditor()
    expect(useAppStore.getState().currentView).toBe('home')
    expect(useAppStore.getState().editingTemplateId).toBeNull()
  })
})

describe('Workflow tabs', () => {
  it('opens a workflow tab', () => {
    useAppStore.getState().openWorkflow('wf-1')
    const state = useAppStore.getState()
    expect(state.currentView).toBe('workflow')
    expect(state.activeWorkflowId).toBe('wf-1')
    expect(state.openWorkflowIds).toEqual(['wf-1'])
  })

  it('does not duplicate open workflow', () => {
    useAppStore.getState().openWorkflow('wf-1')
    useAppStore.getState().openWorkflow('wf-1')
    expect(useAppStore.getState().openWorkflowIds).toEqual(['wf-1'])
  })

  it('closes workflow tab and prunes execution state', () => {
    useAppStore.getState().openWorkflow('wf-1')
    useAppStore.getState().addWorkflowLog('wf-1', {
      id: 'e1',
      type: 'workflow:started',
      workflowId: 'wf-1',
      message: 'started',
      timestamp: Date.now(),
    })
    useAppStore.getState().closeWorkflow('wf-1')
    const state = useAppStore.getState()
    expect(state.openWorkflowIds).toEqual([])
    expect(state.activeWorkflowId).toBeNull()
    expect(state.workflowLogs['wf-1']).toBeUndefined()
    expect(state.currentView).toBe('home')
  })

  it('navigates to sessions when closing last workflow with active sessions', () => {
    useAppStore.getState().addSession('s1', 'proj-1')
    useAppStore.getState().openWorkflow('wf-1')
    useAppStore.getState().closeWorkflow('wf-1')
    expect(useAppStore.getState().currentView).toBe('session')
  })
})

describe('Pane layout', () => {
  it('cycles pane layout 1→2→3→1', () => {
    expect(useAppStore.getState().paneLayout).toBe(1)
    useAppStore.getState().cyclePaneLayout()
    expect(useAppStore.getState().paneLayout).toBe(2)
    useAppStore.getState().cyclePaneLayout()
    expect(useAppStore.getState().paneLayout).toBe(3)
    useAppStore.getState().cyclePaneLayout()
    expect(useAppStore.getState().paneLayout).toBe(1)
  })

  it('resets focused pane when it exceeds new layout', () => {
    useAppStore.getState().setPaneLayout(3)
    useAppStore.getState().setFocusedPane(2)
    useAppStore.getState().setPaneLayout(1)
    expect(useAppStore.getState().focusedPane).toBe(0)
  })
})

describe('Sidebar & Right Panel', () => {
  it('toggles sidebar', () => {
    expect(useAppStore.getState().sidebarOpen).toBe(true)
    useAppStore.getState().toggleSidebar()
    expect(useAppStore.getState().sidebarOpen).toBe(false)
    useAppStore.getState().toggleSidebar()
    expect(useAppStore.getState().sidebarOpen).toBe(true)
  })

  it('toggles right panel', () => {
    expect(useAppStore.getState().rightPanelOpen).toBe(false)
    useAppStore.getState().toggleRightPanel()
    expect(useAppStore.getState().rightPanelOpen).toBe(true)
  })

  it('toggles sidebar section', () => {
    expect(useAppStore.getState().sidebarSections.pinned).toBe(true)
    useAppStore.getState().toggleSidebarSection('pinned')
    expect(useAppStore.getState().sidebarSections.pinned).toBe(false)
  })
})

describe('Notifications', () => {
  it('adds a notification', () => {
    useAppStore.getState().addNotification('info', 'Hello')
    expect(useAppStore.getState().notifications).toHaveLength(1)
    expect(useAppStore.getState().notifications[0]?.message).toBe('Hello')
  })

  it('caps notifications at 10', () => {
    for (let i = 0; i < 15; i++) {
      useAppStore.getState().addNotification('info', `msg ${i}`)
    }
    expect(useAppStore.getState().notifications).toHaveLength(10)
  })

  it('dismisses by id', () => {
    useAppStore.getState().addNotification('info', 'test')
    const id = useAppStore.getState().notifications[0]?.id ?? ''
    useAppStore.getState().dismissNotification(id)
    expect(useAppStore.getState().notifications).toHaveLength(0)
  })
})

describe('Activity feeds', () => {
  it('adds activity events to session feed', () => {
    const evt = makeActivityEvent({ type: 'read', title: 'Reading file' })
    useAppStore.getState().addActivityEvent('s1', evt)
    expect(useAppStore.getState().activityFeeds['s1']).toHaveLength(1)
  })

  it('caps feed at 500 events', () => {
    for (let i = 0; i < 510; i++) {
      useAppStore.getState().addActivityEvent('s1', makeActivityEvent({ id: `e-${i}` }))
    }
    expect(useAppStore.getState().activityFeeds['s1']).toHaveLength(500)
  })

  it('clears activity feed', () => {
    useAppStore.getState().addActivityEvent('s1', makeActivityEvent())
    useAppStore.getState().clearActivityFeed('s1')
    expect(useAppStore.getState().activityFeeds['s1']).toHaveLength(0)
  })
})
