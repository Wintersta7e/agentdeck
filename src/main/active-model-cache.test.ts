import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./active-model-detectors', () => ({
  DETECTORS: { codex: vi.fn() } as Record<string, ReturnType<typeof vi.fn>>,
}))

import { DETECTORS } from './active-model-detectors'
import { resolveActiveModel, invalidateAll, __resetCacheForTests } from './active-model-cache'

const mockCodex = DETECTORS.codex as unknown as ReturnType<typeof vi.fn>

describe('active-model cache', () => {
  beforeEach(() => {
    __resetCacheForTests()
    mockCodex.mockReset()
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'performance'],
    })
  })
  afterEach(() => vi.useRealTimers())

  it('caches within TTL', async () => {
    mockCodex.mockResolvedValue({ modelId: 'gpt-5.4' })
    await resolveActiveModel('codex')
    await resolveActiveModel('codex')
    expect(mockCodex).toHaveBeenCalledTimes(1)
  })

  it('re-reads after TTL expires', async () => {
    mockCodex.mockResolvedValue({ modelId: 'gpt-5.4' })
    await resolveActiveModel('codex')
    vi.advanceTimersByTime(31_000)
    await resolveActiveModel('codex')
    expect(mockCodex).toHaveBeenCalledTimes(2)
  })

  it('dedupes concurrent via inFlight', async () => {
    let resolveIt: (v: unknown) => void = () => {}
    mockCodex.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveIt = r
        }),
    )
    const p1 = resolveActiveModel('codex')
    const p2 = resolveActiveModel('codex')
    resolveIt({ modelId: 'gpt-5.4' })
    await Promise.all([p1, p2])
    expect(mockCodex).toHaveBeenCalledTimes(1)
  })

  it('forceRefresh bypasses TTL + inFlight', async () => {
    let resolveNormal: (v: unknown) => void = () => {}
    mockCodex.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveNormal = r
        }),
    )
    const pNormal = resolveActiveModel('codex')

    mockCodex.mockResolvedValueOnce({ modelId: 'gpt-5.4-force' })
    const pForce = resolveActiveModel('codex', { forceRefresh: true })

    resolveNormal({ modelId: 'gpt-5.4-stale' })
    const [normalR, forceR] = await Promise.all([pNormal, pForce])

    expect(mockCodex).toHaveBeenCalledTimes(2)
    expect(forceR.modelId).toBe('gpt-5.4-force')
    expect(normalR.modelId).toBe('gpt-5.4-stale')
  })

  it('freshness-ordered: older read cannot overwrite fresher force', async () => {
    let resolveNormal: (v: unknown) => void = () => {}
    mockCodex.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveNormal = r
        }),
    )
    resolveActiveModel('codex') // requestSeq=1, starts but doesn't resolve

    mockCodex.mockResolvedValueOnce({ modelId: 'fresh' })
    await resolveActiveModel('codex', { forceRefresh: true }) // requestSeq=2, caches 'fresh'

    resolveNormal({ modelId: 'stale' }) // requestSeq=1 resolves AFTER force; commit rejected
    await new Promise((r) => setImmediate(r))

    const r = await resolveActiveModel('codex')
    expect(r.modelId).toBe('fresh')
  })

  it('invalidateAll clears cache + inFlight', async () => {
    mockCodex.mockResolvedValue({ modelId: 'gpt-5.4' })
    await resolveActiveModel('codex')
    invalidateAll()
    await resolveActiveModel('codex')
    expect(mockCodex).toHaveBeenCalledTimes(2)
  })
})
