import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { WorktreeManager } from '../worktree-manager'
import { makeHandlersMap, makeIpcCall, makeIpcElectronMock } from '../../__test__/ipc-harness'

const handlers = makeHandlersMap()
vi.mock('electron', () => makeIpcElectronMock(handlers))

vi.mock('../logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))

const { registerWorktreeHandlers } = await import('./ipc-worktree')

const call = makeIpcCall(handlers)

describe('ipc-worktree', () => {
  let manager: {
    acquire: ReturnType<typeof vi.fn>
    releasePrimary: ReturnType<typeof vi.fn>
    keep: ReturnType<typeof vi.fn>
    discard: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    handlers.clear()
    manager = {
      acquire: vi.fn(() => Promise.resolve({ path: '/tmp/w', isolated: false })),
      releasePrimary: vi.fn(),
      keep: vi.fn(() => Promise.resolve()),
      discard: vi.fn(() => Promise.resolve()),
    }
    registerWorktreeHandlers(() => manager as unknown as WorktreeManager)
  })

  it('worktree:acquire rejects unsafe projectId', async () => {
    await expect(call('worktree:acquire', './bad', 'sess-1') as Promise<unknown>).rejects.toThrow(
      /projectId/,
    )
  })

  it('worktree:acquire rejects unsafe sessionId', async () => {
    await expect(call('worktree:acquire', 'proj-1', '..') as Promise<unknown>).rejects.toThrow(
      /sessionId/,
    )
  })

  it('worktree:acquire delegates to manager on valid input', async () => {
    await (call('worktree:acquire', 'proj-1', 'sess-1') as Promise<unknown>)
    expect(manager.acquire).toHaveBeenCalled()
  })
})
