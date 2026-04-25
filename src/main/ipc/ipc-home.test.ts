import { describe, it, expect, beforeEach, vi } from 'vitest'

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    },
  },
}))

vi.mock('../git-status', () => ({
  getGitStatus: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('../review-tracker', () => ({
  createReviewTracker: () => ({
    getReviews: vi.fn(() => []),
    dismissReview: vi.fn(),
    addReview: vi.fn(),
  }),
}))

vi.mock('../cost-history', () => ({
  createCostHistory: () => ({
    recordCost: vi.fn(),
    getHistory: vi.fn(() => []),
    getBudget: vi.fn(() => null),
    setBudget: vi.fn(),
    flush: vi.fn(),
  }),
}))

const { registerHomeHandlers } = await import('./ipc-home')

function call(channel: string, ...args: unknown[]): unknown {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`no handler for ${channel}`)
  return fn(null, ...args)
}

describe('ipc-home', () => {
  beforeEach(() => {
    handlers.clear()
    registerHomeHandlers(() => '/home/project')
  })

  it('projects:gitStatus rejects unsafe projectId', async () => {
    await expect(call('projects:gitStatus', './evil') as Promise<unknown>).rejects.toThrow(
      /projectId/,
    )
  })

  it('projects:gitStatus returns null when the lookup yields no path', async () => {
    handlers.clear()
    registerHomeHandlers(() => null)
    const result = await (call('projects:gitStatus', 'safe-id') as Promise<unknown>)
    expect(result).toBeNull()
  })

  it('projects:pendingReviews rejects unsafe projectId', () => {
    expect(() => call('projects:pendingReviews', './x')).toThrow(/projectId/)
  })

  it('projects:dismissReview rejects unsafe reviewId', () => {
    expect(() => call('projects:dismissReview', '..')).toThrow(/reviewId/)
  })
})
