import { ipcMain } from 'electron'
import type { WorktreeManager } from '../worktree-manager'
import { validateId } from '../validation'

/**
 * Worktree IPC handlers: acquire, inspect, discard, keep, releasePrimary.
 *
 * Uses a getter for worktreeManager because the instance is created after module load.
 * IDs validated through the canonical validateId helper (length-bounded).
 */
export function registerWorktreeHandlers(getWorktreeManager: () => WorktreeManager | null): void {
  ipcMain.handle('worktree:acquire', async (_, projectId: unknown, sessionId: unknown) => {
    validateId(projectId, 'projectId')
    validateId(sessionId, 'sessionId')
    const mgr = getWorktreeManager()
    if (!mgr) throw new Error('WorktreeManager not initialized')
    return mgr.acquire(projectId as string, sessionId as string)
  })

  ipcMain.handle('worktree:inspect', async (_, sessionId: unknown) => {
    validateId(sessionId, 'sessionId')
    const mgr = getWorktreeManager()
    if (!mgr) throw new Error('WorktreeManager not initialized')
    return mgr.inspect(sessionId as string)
  })

  ipcMain.handle('worktree:discard', async (_, sessionId: unknown) => {
    validateId(sessionId, 'sessionId')
    const mgr = getWorktreeManager()
    if (!mgr) throw new Error('WorktreeManager not initialized')
    return mgr.discard(sessionId as string)
  })

  ipcMain.handle('worktree:keep', async (_, sessionId: unknown) => {
    validateId(sessionId, 'sessionId')
    const mgr = getWorktreeManager()
    if (!mgr) throw new Error('WorktreeManager not initialized')
    return mgr.keep(sessionId as string)
  })

  ipcMain.handle('worktree:releasePrimary', async (_, projectId: unknown, sessionId: unknown) => {
    validateId(projectId, 'projectId')
    validateId(sessionId, 'sessionId')
    const mgr = getWorktreeManager()
    if (!mgr) throw new Error('WorktreeManager not initialized')
    mgr.releasePrimary(projectId as string, sessionId as string)
  })
}
