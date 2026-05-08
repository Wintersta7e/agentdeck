import { ipcMain } from 'electron'
import type { WorktreeManager } from '../worktree-manager'
import { validateId } from '../validation'

/**
 * Worktree IPC handlers: acquire, inspect, discard, keep, releasePrimary.
 *
 * Uses a getter for worktreeManager because the instance is created after module load.
 * IDs are validated through `validateId`, which returns the validated string —
 * capture it and pass it on rather than using `as string` casts on the raw input.
 */
export function registerWorktreeHandlers(getWorktreeManager: () => WorktreeManager | null): void {
  ipcMain.handle('worktree:acquire', async (_, projectId: unknown, sessionId: unknown) => {
    const pid = validateId(projectId, 'projectId')
    const sid = validateId(sessionId, 'sessionId')
    const mgr = getWorktreeManager()
    if (!mgr) throw new Error('WorktreeManager not initialized')
    return mgr.acquire(pid, sid)
  })

  ipcMain.handle('worktree:inspect', async (_, sessionId: unknown) => {
    const sid = validateId(sessionId, 'sessionId')
    const mgr = getWorktreeManager()
    if (!mgr) throw new Error('WorktreeManager not initialized')
    return mgr.inspect(sid)
  })

  ipcMain.handle('worktree:discard', async (_, sessionId: unknown) => {
    const sid = validateId(sessionId, 'sessionId')
    const mgr = getWorktreeManager()
    if (!mgr) throw new Error('WorktreeManager not initialized')
    return mgr.discard(sid)
  })

  ipcMain.handle('worktree:keep', async (_, sessionId: unknown) => {
    const sid = validateId(sessionId, 'sessionId')
    const mgr = getWorktreeManager()
    if (!mgr) throw new Error('WorktreeManager not initialized')
    return mgr.keep(sid)
  })

  ipcMain.handle('worktree:releasePrimary', async (_, projectId: unknown, sessionId: unknown) => {
    const pid = validateId(projectId, 'projectId')
    const sid = validateId(sessionId, 'sessionId')
    const mgr = getWorktreeManager()
    if (!mgr) throw new Error('WorktreeManager not initialized')
    mgr.releasePrimary(pid, sid)
  })
}
