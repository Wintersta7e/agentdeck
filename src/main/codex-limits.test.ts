import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────
// readCodexLimits delegates the actual disk read to wslTry; mocking it lets
// us drive the module-level inFlight coalescing/reset without touching WSL.
const { mockWslTry } = vi.hoisted(() => ({
  mockWslTry: vi.fn(),
}))

vi.mock('./wsl-exec', () => ({
  wslTry: (...args: unknown[]) => mockWslTry(...args),
}))

const { parseCodexLimits, readCodexLimits } = await import('./codex-limits')

beforeEach(() => {
  mockWslTry.mockReset()
})

// Synthetic fixture (values are made up — not from any real account).
const line = JSON.stringify({
  timestamp: '2026-01-15T10:00:00.000Z',
  type: 'event_msg',
  payload: {
    type: 'token_count',
    rate_limits: {
      limit_id: 'codex',
      plan_type: 'plus',
      primary: { used_percent: 42, window_minutes: 300, resets_at: 1900000000 },
      secondary: { used_percent: 13, window_minutes: 10080, resets_at: 1900900000 },
    },
  },
})

describe('parseCodexLimits', () => {
  it('parses primary (5h) and weekly windows + plan type + asOf', () => {
    const r = parseCodexLimits(line)
    expect(r).not.toBeNull()
    expect(r!.primary).toEqual({ usedPercent: 42, windowMinutes: 300, resetsAt: 1900000000 })
    expect(r!.weekly).toEqual({ usedPercent: 13, windowMinutes: 10080, resetsAt: 1900900000 })
    expect(r!.planType).toBe('plus')
    expect(r!.asOf).toBe(Date.parse('2026-01-15T10:00:00.000Z'))
  })

  it('returns null for a line without rate_limits', () => {
    expect(parseCodexLimits(JSON.stringify({ payload: { type: 'token_count' } }))).toBeNull()
  })

  it('returns null for non-JSON', () => {
    expect(parseCodexLimits('not json')).toBeNull()
  })

  it('tolerates a missing window (e.g. only primary present)', () => {
    const partial = JSON.stringify({
      timestamp: '2026-01-15T09:00:00.000Z',
      payload: {
        rate_limits: {
          plan_type: 'pro',
          primary: { used_percent: 5, window_minutes: 300, resets_at: 111 },
        },
      },
    })
    const r = parseCodexLimits(partial)
    expect(r!.primary?.usedPercent).toBe(5)
    expect(r!.weekly).toBeNull()
    expect(r!.planType).toBe('pro')
  })
})

describe('readCodexLimits', () => {
  it('coalesces concurrent callers into a single underlying WSL read', async () => {
    // Hold the read open so both callers observe the same in-flight promise.
    let resolveRead: (v: string | null) => void = () => {}
    mockWslTry.mockReturnValue(
      new Promise<string | null>((resolve) => {
        resolveRead = resolve
      }),
    )

    const a = readCodexLimits()
    const b = readCodexLimits()

    // Both calls are in flight, but only one subprocess was spawned.
    expect(mockWslTry).toHaveBeenCalledTimes(1)

    resolveRead(line)
    const [ra, rb] = await Promise.all([a, b])
    expect(ra).toEqual(rb)
    expect(ra!.planType).toBe('plus')
    // Still just the one read across both resolved callers.
    expect(mockWslTry).toHaveBeenCalledTimes(1)
  })

  it('resets inFlight after a call settles so a later call starts fresh', async () => {
    mockWslTry.mockResolvedValueOnce(line)
    const first = await readCodexLimits()
    expect(first!.planType).toBe('plus')

    // A subsequent, non-overlapping call must spawn its own read (inFlight cleared).
    mockWslTry.mockResolvedValueOnce(null)
    const second = await readCodexLimits()
    expect(second).toBeNull()
    expect(mockWslTry).toHaveBeenCalledTimes(2)
  })

  it('does not permanently lock inFlight when the underlying read rejects', async () => {
    // .finally() must clear inFlight even on failure, otherwise one error
    // would wedge every future call.
    mockWslTry.mockRejectedValueOnce(new Error('wsl blew up'))
    await expect(readCodexLimits()).rejects.toThrow('wsl blew up')

    // Recovery: the next call runs normally rather than re-throwing the stale promise.
    mockWslTry.mockResolvedValueOnce(line)
    const recovered = await readCodexLimits()
    expect(recovered!.planType).toBe('plus')
    expect(mockWslTry).toHaveBeenCalledTimes(2)
  })
})
