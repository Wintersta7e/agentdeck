import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAmbientState } from './useAmbientState'
import { useAppStore } from '../store/appStore'

describe('useAmbientState', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState())
  })

  it('returns idle state with no sessions', () => {
    const { result } = renderHook(() => useAmbientState())
    expect(result.current.activeSessionCount).toBe(0)
    expect(result.current.isIdle).toBe(true)
    expect(result.current.veinSpeed).toBeCloseTo(0.3)
  })

  it('returns active state with running sessions', () => {
    useAppStore.setState({
      sessions: {
        '1': { id: '1', projectId: 'p1', status: 'running', startedAt: Date.now() },
      },
    })
    const { result } = renderHook(() => useAmbientState())
    expect(result.current.activeSessionCount).toBe(1)
    expect(result.current.isIdle).toBe(false)
    expect(result.current.veinSpeed).toBeCloseTo(0.6)
  })

  it('caps veinSpeed at 0.85 for 2+ sessions', () => {
    useAppStore.setState({
      sessions: {
        '1': { id: '1', projectId: 'p1', status: 'running', startedAt: Date.now() },
        '2': { id: '2', projectId: 'p2', status: 'running', startedAt: Date.now() },
        '3': { id: '3', projectId: 'p3', status: 'running', startedAt: Date.now() },
      },
    })
    const { result } = renderHook(() => useAmbientState())
    expect(result.current.activeSessionCount).toBe(3)
    expect(result.current.veinSpeed).toBeCloseTo(0.85)
  })
})
