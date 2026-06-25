import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeHandlersMap, makeIpcCall, makeIpcElectronMock } from '../../__test__/ipc-harness'
import type { ReviewTracker } from '../review-tracker'

const handlers = makeHandlersMap()
vi.mock('electron', () => makeIpcElectronMock(handlers, { app: { getPath: () => '/tmp' } }))

vi.mock('../git-status', () => ({
  getGitStatus: vi.fn(() => Promise.resolve(null)),
}))

const { registerHomeHandlers } = await import('./ipc-home')

const call = makeIpcCall(handlers)

function makeTracker(): ReviewTracker {
  return {
    addReview: vi.fn(),
    dismissReview: vi.fn(),
    getReviews: vi.fn(() => []),
    getAllReviews: vi.fn(() => []),
  } as unknown as ReviewTracker
}

describe('ipc-home', () => {
  beforeEach(() => {
    handlers.clear()
    registerHomeHandlers(() => '/home/project', makeTracker())
  })

  it('projects:gitStatus rejects unsafe projectId', async () => {
    await expect(call('projects:gitStatus', './evil') as Promise<unknown>).rejects.toThrow(
      /projectId/,
    )
  })

  it('projects:gitStatus returns null when the lookup yields no path', async () => {
    handlers.clear()
    registerHomeHandlers(() => null, makeTracker())
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
