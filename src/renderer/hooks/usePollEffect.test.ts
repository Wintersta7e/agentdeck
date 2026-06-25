import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePollEffect } from './usePollEffect'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('usePollEffect', () => {
  it('runs the loader on mount and then every interval', () => {
    const load = vi.fn()
    renderHook(() => usePollEffect(load, 1000))
    expect(load).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(load).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1000)
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('flips isActive() to false after cleanup so stale updates can be skipped', () => {
    let captured: (() => boolean) | undefined
    const load = vi.fn((isActive: () => boolean) => {
      captured = isActive
    })
    const { unmount } = renderHook(() => usePollEffect(load, 1000))
    expect(captured?.()).toBe(true)
    unmount()
    expect(captured?.()).toBe(false)
  })

  it('stops polling after unmount', () => {
    const load = vi.fn()
    const { unmount } = renderHook(() => usePollEffect(load, 1000))
    expect(load).toHaveBeenCalledTimes(1)
    unmount()
    vi.advanceTimersByTime(5000)
    expect(load).toHaveBeenCalledTimes(1)
  })
})
