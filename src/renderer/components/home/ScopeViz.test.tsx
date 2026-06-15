import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { ScopeViz } from './ScopeViz'
import { useAppStore } from '../../store/appStore'

// Pin the snapshot-stability contract of ScopeViz: the selector pulls the raw
// `sessions` object reference and derives the running list via useMemo. An
// earlier revision returned a fresh array from the selector on every call
// and crashed the app with React error #185 (Maximum update depth exceeded)
// at mount. The tests here lock that contract — if someone "simplifies" the
// selector back into Object.values(...).filter(...), rendering blows up.

/** Count rendered session blips (one core circle + one label per running session). */
function blipCount(container: HTMLElement): number {
  const cores = container.querySelectorAll('.scope-viz__blip-core').length
  const labels = container.querySelectorAll('.scope-viz__blip-label').length
  // The two must stay in lock-step — both are emitted once per running session.
  expect(cores).toBe(labels)
  return cores
}

describe('ScopeViz', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState())
  })
  afterEach(() => cleanup())

  it('shows the running count and one blip per running session', () => {
    useAppStore.getState().addSession('s1', 'p-1', { agentOverride: 'claude-code' })
    useAppStore.getState().setSessionStatus('s1', 'running')
    useAppStore.getState().addSession('s2', 'p-2', { agentOverride: 'codex' })
    useAppStore.getState().setSessionStatus('s2', 'running')
    useAppStore.getState().addSession('s3', 'p-3', { agentOverride: 'aider' })
    useAppStore.getState().setSessionStatus('s3', 'running')

    const { container } = render(<ScopeViz />)

    expect(container.textContent).toMatch(/3 ACTIVE/)
    expect(blipCount(container)).toBe(3)
    // STANDBY is the empty state — must not appear when sessions are running.
    expect(container.textContent).not.toMatch(/STANDBY/)
  })

  it('renders the STANDBY empty state and no blips when nothing is running', () => {
    const { container } = render(<ScopeViz />)

    expect(container.textContent).toMatch(/STANDBY/)
    expect(container.textContent).toMatch(/0 ACTIVE/)
    expect(blipCount(container)).toBe(0)
  })

  it('does not count EXITED sessions as active', () => {
    useAppStore.getState().addSession('alive', 'p-1', { agentOverride: 'claude-code' })
    useAppStore.getState().setSessionStatus('alive', 'running')
    useAppStore.getState().addSession('dead', 'p-2', { agentOverride: 'codex' })
    useAppStore.getState().setSessionStatus('dead', 'exited')

    const { container } = render(<ScopeViz />)

    // Two sessions exist but only the running one counts toward ACTIVE/blips.
    expect(container.textContent).toMatch(/1 ACTIVE/)
    expect(container.textContent).not.toMatch(/2 ACTIVE/)
    expect(blipCount(container)).toBe(1)
    expect(container.textContent).not.toMatch(/STANDBY/)
  })

  it('survives repeated re-renders without triggering an infinite loop', () => {
    // If the selector returns a new array reference on every call,
    // useSyncExternalStore would throw #185 long before we hit 10 rerenders.
    const { rerender, container } = render(<ScopeViz />)
    for (let i = 0; i < 10; i += 1) {
      rerender(<ScopeViz />)
    }
    // Survived the loop and still renders the empty state.
    expect(container.textContent).toMatch(/STANDBY/)
  })

  it('reflects store mutations between renders', () => {
    const { rerender, container } = render(<ScopeViz />)
    expect(blipCount(container)).toBe(0)

    // Mutations after mount drive useSyncExternalStore re-renders — wrap them in
    // act() so React flushes the update inside the test (no act() warning).
    act(() => {
      useAppStore.getState().addSession('live-1', 'p-x', { agentOverride: 'goose' })
      useAppStore.getState().setSessionStatus('live-1', 'running')
    })
    rerender(<ScopeViz />)
    expect(container.textContent).toMatch(/1 ACTIVE/)
    expect(blipCount(container)).toBe(1)

    act(() => {
      useAppStore.getState().setSessionStatus('live-1', 'exited')
    })
    rerender(<ScopeViz />)
    expect(container.textContent).toMatch(/0 ACTIVE/)
    expect(blipCount(container)).toBe(0)
  })
})
