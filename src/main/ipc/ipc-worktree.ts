import { CH } from '../../shared/ipc-channels'
import { ipcMain } from 'electron'
import type { WorktreeManager } from '../worktree-manager'
import { validateId } from '../validation'

const UNAVAILABLE = 'Worktree isolation unavailable - WSL $HOME could not be resolved'

/**
 * Worktree IPC handlers: acquire, inspect, discard, keep, releasePrimary.
 *
 * The getter is async because the manager is initialised on demand: a cold
 * `wsl.exe` can fail to resolve $HOME at startup, and the first session start
 * is the natural point to try again. Reaching UNAVAILABLE therefore means WSL
 * is genuinely not usable, not merely slow to wake.
 *
 * IDs are validated through `validateId`, which returns the validated string —
 * capture it and pass it on rather than using `as string` casts on the raw input.
 */
export function registerWorktreeHandlers(
  getWorktreeManager: () => Promise<WorktreeManager | null>,
): void {
  ipcMain.handle(CH.worktreeAcquire, async (_, projectId: unknown, sessionId: unknown) => {
    const pid = validateId(projectId, 'projectId')
    const sid = validateId(sessionId, 'sessionId')
    const mgr = await getWorktreeManager()
    if (!mgr) throw new Error(UNAVAILABLE)
    return mgr.acquire(pid, sid)
  })

  ipcMain.handle(CH.worktreeInspect, async (_, sessionId: unknown) => {
    const sid = validateId(sessionId, 'sessionId')
    const mgr = await getWorktreeManager()
    if (!mgr) throw new Error(UNAVAILABLE)
    return mgr.inspect(sid)
  })

  ipcMain.handle(CH.worktreeDiscard, async (_, sessionId: unknown) => {
    const sid = validateId(sessionId, 'sessionId')
    const mgr = await getWorktreeManager()
    if (!mgr) throw new Error(UNAVAILABLE)
    return mgr.discard(sid)
  })

  ipcMain.handle(CH.worktreeKeep, async (_, sessionId: unknown) => {
    const sid = validateId(sessionId, 'sessionId')
    const mgr = await getWorktreeManager()
    if (!mgr) throw new Error(UNAVAILABLE)
    return mgr.keep(sid)
  })

  ipcMain.handle(CH.worktreeReleasePrimary, async (_, projectId: unknown, sessionId: unknown) => {
    const pid = validateId(projectId, 'projectId')
    const sid = validateId(sessionId, 'sessionId')
    const mgr = await getWorktreeManager()
    if (!mgr) throw new Error(UNAVAILABLE)
    mgr.releasePrimary(pid, sid)
  })
}
