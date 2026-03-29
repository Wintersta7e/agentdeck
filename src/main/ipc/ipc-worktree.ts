import { ipcMain } from 'electron'
import type { WorktreeManager } from '../worktree-manager'

/**
 * Worktree IPC handlers: acquire, inspect, discard, keep.
 *
 * Uses a getter for worktreeManager because the instance is created after module load.
 */
export function registerWorktreeHandlers(getWorktreeManager: () => WorktreeManager | null): void {
  ipcMain.handle('worktree:acquire', async (_, projectId: unknown, sessionId: unknown) => {
    if (typeof projectId !== 'string' || !projectId)
      throw new Error('Invalid projectId: must be a non-empty string')
    if (typeof sessionId !== 'string' || !sessionId)
      throw new Error('Invalid sessionId: must be a non-empty string')
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
}
