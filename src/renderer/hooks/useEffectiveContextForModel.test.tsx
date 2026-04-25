import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useEffectiveContextForModel } from './useEffectiveContext'

let mockGetEffectiveContextForModel: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockGetEffectiveContextForModel = vi.fn().mockResolvedValue({
    value: 500_000,
    source: 'override-model',
    modelId: 'weirdnet-xyz',
  })
  ;(globalThis as unknown as { window: Window }).window.agentDeck = {
    agents: {
      getEffectiveContextForModel: mockGetEffectiveContextForModel,
    },
  } as never
})

describe('useEffectiveContextForModel (fallback-only)', () => {
  it('runs no detector and returns resolver result', async () => {
    const { result } = renderHook(() => useEffectiveContextForModel('aider', 'weirdnet-xyz'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.value).toBe(500_000)
    expect(result.current.source).toBe('override-model')
  })

  it('enabled:false skips the IPC call and immediately resolves to null', async () => {
    const { result } = renderHook(() =>
      useEffectiveContextForModel('aider', 'weirdnet-xyz', { enabled: false }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.value).toBeNull()
    expect(result.current.source).toBeNull()
    expect(result.current.modelId).toBeNull()
    expect(mockGetEffectiveContextForModel).not.toHaveBeenCalled()
  })
})
