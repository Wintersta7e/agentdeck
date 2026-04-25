import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useEffectiveContext } from './useEffectiveContext'

let mockGetEffectiveContext: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockGetEffectiveContext = vi.fn().mockResolvedValue({
    value: 1_000_000,
    source: 'registry-exact',
    modelId: 'claude-opus-4-7[1m]',
  })
  ;(globalThis as unknown as { window: Window }).window.agentDeck = {
    agents: {
      getEffectiveContext: mockGetEffectiveContext,
      getOverrides: vi.fn().mockResolvedValue({ agent: {}, model: {} }),
    },
  } as never
})

describe('useEffectiveContext', () => {
  it('starts loading then returns value', async () => {
    const { result } = renderHook(() => useEffectiveContext('claude-code'))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.value).toBe(1_000_000)
    expect(result.current.source).toBe('registry-exact')
  })

  it('enabled:false skips the IPC call and immediately resolves to null', async () => {
    const { result } = renderHook(() => useEffectiveContext('claude-code', { enabled: false }))
    // Should already be settled — no async work to wait for
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.value).toBeNull()
    expect(result.current.source).toBeNull()
    expect(result.current.modelId).toBeNull()
    expect(mockGetEffectiveContext).not.toHaveBeenCalled()
  })
})
