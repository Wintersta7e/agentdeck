import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useEffectiveContextForModel } from '../useEffectiveContext'

beforeEach(() => {
  ;(globalThis as unknown as { window: Window }).window.agentDeck = {
    agents: {
      getEffectiveContextForModel: vi.fn().mockResolvedValue({
        value: 500_000,
        source: 'override-model',
        modelId: 'weirdnet-xyz',
      }),
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
})
