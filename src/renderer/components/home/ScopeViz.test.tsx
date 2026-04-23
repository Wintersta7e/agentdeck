import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ScopeViz } from './ScopeViz'
import { useAppStore } from '../../store/appStore'

// Pin the snapshot-stability contract of ScopeViz: the selector pulls the raw
// `sessions` object reference and derives the running list via useMemo. An
// earlier revision returned a fresh array from the selector on every call
// and crashed the app with React error #185 (Maximum update depth exceeded)
// at mount. The tests here lock that contract — if someone "simplifies" the
// selector back into Object.values(...).filter(...), rendering blows up.

describe('ScopeViz selector shape', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState())
  })
  afterEach(() => cleanup())

  it('renders without throwing when no sessions are running', () => {
    expect(() => render(<ScopeViz />)).not.toThrow()
  })

  it('renders without throwing with several running sessions', () => {
    useAppStore.getState().addSession('s1', 'p-1', { agentOverride: 'claude-code' })
    useAppStore.getState().setSessionStatus('s1', 'running')
    useAppStore.getState().addSession('s2', 'p-2', { agentOverride: 'codex' })
    useAppStore.getState().setSessionStatus('s2', 'running')
    useAppStore.getState().addSession('s3', 'p-3', { agentOverride: 'aider' })
    useAppStore.getState().setSessionStatus('s3', 'running')

    expect(() => render(<ScopeViz />)).not.toThrow()
  })

  it('survives repeated re-renders without triggering an infinite loop', () => {
    // If the selector returns a new array reference on every call,
    // useSyncExternalStore would throw #185 long before we hit 10 rerenders.
    const { rerender } = render(<ScopeViz />)
    for (let i = 0; i < 10; i += 1) {
      rerender(<ScopeViz />)
    }
    // Getting here without throwing is the assertion.
    expect(true).toBe(true)
  })

  it('survives store mutations between renders', () => {
    const { rerender } = render(<ScopeViz />)
    useAppStore.getState().addSession('live-1', 'p-x', { agentOverride: 'goose' })
    useAppStore.getState().setSessionStatus('live-1', 'running')
    rerender(<ScopeViz />)
    useAppStore.getState().setSessionStatus('live-1', 'exited')
    rerender(<ScopeViz />)
    expect(true).toBe(true)
  })
})
