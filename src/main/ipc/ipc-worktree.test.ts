import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { WorktreeManager } from '../worktree-manager'

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    },
  },
}))

vi.mock('../logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))

const { registerWorktreeHandlers } = await import('./ipc-worktree')

function call(channel: string, ...args: unknown[]): unknown {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`no handler for ${channel}`)
  return fn(null, ...args)
}

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
