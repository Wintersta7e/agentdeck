import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useElapsedTime } from '../useElapsedTime'

describe('useElapsedTime cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('updates the displayed string as the shared ticker fires', () => {
    const startedAt = Date.now()
    const { result } = renderHook(() => useElapsedTime(startedAt))
    expect(result.current).toMatch(/^\d+s$/)
    act(() => {
      vi.advanceTimersByTime(61_000)
    })
    // After 61s the display transitions to "1m 01s"
    expect(result.current).toMatch(/^1m /)
  })

  it('stops updating after unmount (no dangling setInterval)', () => {
    const startedAt = Date.now()
    const { result, unmount } = renderHook(() => useElapsedTime(startedAt))
    const before = result.current
    unmount()
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    // Value frozen at unmount time — React does not schedule updates on
    // an unmounted component; the shared ticker must have unsubscribed.
    expect(result.current).toBe(before)
  })
})
