import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../appStore'

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
})

describe('setActiveSession', () => {
  it('places session in focused pane when not already visible', () => {
    useAppStore.getState().addSession('s1', 'proj-1')
    useAppStore.getState().addSession('s2', 'proj-2')
    // s2 is in pane 0 (focused pane after addSession). Put s1 in pane 0 explicitly.
    useAppStore.getState().setPaneSession(0, 's1')
    useAppStore.setState({ focusedPane: 1, paneLayout: 2 })
    // s2 is not in any visible pane slot 0..1 after we moved pane 0 to s1
    useAppStore.getState().setActiveSession('s2')
    const state = useAppStore.getState()
    expect(state.paneSessions[1]).toBe('s2')
  })

  it('does not move session if already in a visible pane', () => {
    useAppStore.getState().addSession('s1', 'proj-1')
    // s1 is placed in pane 0 by addSession
    const before = useAppStore.getState().paneSessions[0]
    useAppStore.getState().setActiveSession('s1')
    const state = useAppStore.getState()
    expect(state.paneSessions[0]).toBe(before)
    expect(state.paneSessions[0]).toBe('s1')
  })

  it('sets currentView to session', () => {
    useAppStore.getState().addSession('s1', 'proj-1')
    useAppStore.setState({ currentView: 'home' })
    useAppStore.getState().setActiveSession('s1')
    expect(useAppStore.getState().currentView).toBe('session')
  })
})

describe('setPaneSession', () => {
  it('assigns a session to a specific pane index', () => {
    useAppStore.getState().setPaneSession(0, 'sA')
    expect(useAppStore.getState().paneSessions[0]).toBe('sA')
  })

  it('extends paneSessions array if index is beyond current length', () => {
    // Start with empty paneSessions
    expect(useAppStore.getState().paneSessions.length).toBe(0)
    useAppStore.getState().setPaneSession(2, 'sB')
    const panes = useAppStore.getState().paneSessions
    expect(panes.length).toBe(3)
    expect(panes[2]).toBe('sB')
    // Slots 0 and 1 should be padded with empty strings
    expect(panes[0]).toBe('')
    expect(panes[1]).toBe('')
  })

  it('overwrites an existing pane assignment', () => {
    useAppStore.getState().setPaneSession(0, 'sA')
    useAppStore.getState().setPaneSession(0, 'sB')
    expect(useAppStore.getState().paneSessions[0]).toBe('sB')
  })
})
