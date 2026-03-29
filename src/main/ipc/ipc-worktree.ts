import { ipcMain } from 'electron'
import type { WorktreeManager } from '../worktree-manager'

const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/

/**
 * Worktree IPC handlers: acquire, inspect, discard, keep.
 *
 * Uses a getter for worktreeManager because the instance is created after module load.
 */
export function registerWorktreeHandlers(getWorktreeManager: () => WorktreeManager | null): void {
  ipcMain.handle('worktree:acquire', async (_, projectId: unknown, sessionId: unknown) => {
    if (typeof projectId !== 'string' || !SAFE_ID_RE.test(projectId))
      throw new Error('Invalid projectId: must match /^[a-zA-Z0-9_-]+$/')
    if (typeof sessionId !== 'string' || !SAFE_ID_RE.test(sessionId))
      throw new Error('Invalid sessionId: must match /^[a-zA-Z0-9_-]+$/')
    const mgr = getWorktreeManager()
    if (!mgr) throw new Error('WorktreeManager not initialized')
    return mgr.acquire(projectId, sessionId)
  })

  ipcMain.handle('worktree:inspect', async (_, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId)
      throw new Error('Invalid sessionId: must be a non-empty string')
    const mgr = getWorktreeManager()
    if (!mgr) throw new Error('WorktreeManager not initialized')
    return mgr.inspect(sessionId)
  })

  ipcMain.handle('worktree:discard', async (_, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId)
      throw new Error('Invalid sessionId: must be a non-empty string')
    const mgr = getWorktreeManager()
    if (!mgr) throw new Error('WorktreeManager not initialized')
    return mgr.discard(sessionId)
  })

  ipcMain.handle('worktree:keep', async (_, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId)
      throw new Error('Invalid sessionId: must be a non-empty string')
    const mgr = getWorktreeManager()
    if (!mgr) throw new Error('WorktreeManager not initialized')
    return mgr.keep(sessionId)
  })

  ipcMain.handle('worktree:releasePrimary', async (_, projectId: unknown, sessionId: unknown) => {
    if (typeof projectId !== 'string' || !SAFE_ID_RE.test(projectId))
      throw new Error('Invalid projectId: must match /^[a-zA-Z0-9_-]+$/')
    if (typeof sessionId !== 'string' || !SAFE_ID_RE.test(sessionId))
      throw new Error('Invalid sessionId: must match /^[a-zA-Z0-9_-]+$/')
    const mgr = getWorktreeManager()
    if (!mgr) throw new Error('WorktreeManager not initialized')
    mgr.releasePrimary(projectId, sessionId)
  })
}
