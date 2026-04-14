import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMidnight } from '../useMidnight'

function localMidnight(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

describe('useMidnight', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns today local midnight on first render', () => {
    // Pick a fixed local time well inside a day
    const noon = new Date(2026, 3, 14, 12, 0, 0, 0)
    vi.setSystemTime(noon)
    const { result } = renderHook(() => useMidnight())
    expect(result.current).toBe(localMidnight(noon.getTime()))
  })

  it('recomputes at midnight when the scheduled timer fires', () => {
    const start = new Date(2026, 3, 14, 23, 59, 30, 0)
    vi.setSystemTime(start)
    const { result } = renderHook(() => useMidnight())
    const firstMidnight = result.current

    // Advance past midnight and let the timer fire
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current).toBeGreaterThan(firstMidnight)
    // The new value should be exactly one local day later
    expect(result.current - firstMidnight).toBeGreaterThanOrEqual(23 * 3_600_000)
    expect(result.current - firstMidnight).toBeLessThanOrEqual(25 * 3_600_000)
  })

  it('clears the pending timer on unmount', () => {
    const noon = new Date(2026, 3, 14, 12, 0, 0, 0)
    vi.setSystemTime(noon)
    const { result, unmount } = renderHook(() => useMidnight())
    const firstMidnight = result.current
    unmount()
    // Advancing past the next midnight after unmount must not throw or update
    act(() => {
      vi.advanceTimersByTime(24 * 3_600_000)
    })
    // Value unchanged (component is unmounted, no re-renders)
    expect(result.current).toBe(firstMidnight)
  })
})
