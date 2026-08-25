import { describe, it, expect, vi } from 'vitest'
import { createWorktreeProvider } from './worktree-provider'
import type { WorktreeManager } from './worktree-manager'

const fakeManager = (): WorktreeManager => ({}) as WorktreeManager

describe('createWorktreeProvider', () => {
  it('caches the manager after a successful attempt', async () => {
    const create = vi.fn<() => Promise<WorktreeManager | null>>(async () => fakeManager())
    const provider = createWorktreeProvider({ create })

    const first = await provider.get()
    const second = await provider.get()

    expect(first).not.toBeNull()
    expect(second).toBe(first)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('retries on a later call when the first attempt fails', async () => {
    // Regression: a cold WSL at startup left the manager null for the entire
    // app session, so every later `worktree:acquire` threw "WorktreeManager
    // not initialized" and sessions silently ran without isolation.
    const manager = fakeManager()
    const create = vi
      .fn<() => Promise<WorktreeManager | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(manager)
    const provider = createWorktreeProvider({ create })

    expect(await provider.get()).toBeNull()
    expect(await provider.get()).toBe(manager)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('recovers when an attempt rejects', async () => {
    const manager = fakeManager()
    const create = vi
      .fn<() => Promise<WorktreeManager | null>>()
      .mockRejectedValueOnce(new Error('wsl.exe cold start'))
      .mockResolvedValueOnce(manager)
    const provider = createWorktreeProvider({ create })

    expect(await provider.get()).toBeNull()
    expect(await provider.get()).toBe(manager)
  })

  it('shares one in-flight attempt across concurrent callers', async () => {
    let settle!: (manager: WorktreeManager | null) => void
    const create = vi.fn<() => Promise<WorktreeManager | null>>(
      () =>
        new Promise<WorktreeManager | null>((resolve) => {
          settle = resolve
        }),
    )
    const provider = createWorktreeProvider({ create })

    const first = provider.get()
    const second = provider.get()
    settle(fakeManager())

    expect(await first).toBe(await second)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('notifies onReady once, only on success', async () => {
    const onReady = vi.fn()
    const manager = fakeManager()
    const create = vi
      .fn<() => Promise<WorktreeManager | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(manager)
    const provider = createWorktreeProvider({ create, onReady })

    await provider.get()
    expect(onReady).not.toHaveBeenCalled()

    await provider.get()
    await provider.get()
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(onReady).toHaveBeenCalledWith(manager)
  })
})
