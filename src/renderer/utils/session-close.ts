import { useAppStore } from '../store/appStore'
import { promptDirtyWorktree } from './prompt-dirty-worktree'

const logWarn = (msg: string, data?: unknown): void => {
  window.agentDeck.log.send('warn', 'session-close', msg, data ?? undefined)
}

interface WorktreeInspection {
  hasChanges: boolean
  hasUnmerged: boolean
  branch: string
}

// Tracks sessions currently being closed so a rapid second click on the close
// button doesn't race pty.kill + prune against the in-flight close. Keyed by
// sessionId so unrelated concurrent closes still proceed in parallel.
const inFlight = new Set<string>()

// Visible for tests that want to assert the guard is empty between runs.
export function __resetCloseSessionGuardForTest(): void {
  inFlight.clear()
}

export async function closeSession(sessionId: string): Promise<void> {
  const state = useAppStore.getState()
  const session = state.sessions[sessionId]
  if (!session) return
  // Duplicate close for the same session while one is already in orchestration
  // -> no-op, mirroring the unknown-id early return above.
  if (inFlight.has(sessionId)) return
  inFlight.add(sessionId)
  try {
    let inspection: WorktreeInspection | null = null
    try {
      inspection = await window.agentDeck.worktree.inspect(sessionId)
    } catch {
      inspection = null
    }

    let commit: 'keep' | 'discard' | 'none' = 'none'
    let commitSource: 'auto' | 'user' = 'auto'
    if (inspection) {
      const { hasChanges, hasUnmerged } = inspection
      if (hasChanges) {
        const choice = await promptDirtyWorktree({
          branch: inspection.branch,
          hasChanges,
          hasUnmerged,
        })
        if (choice === 'cancel') return
        commit = choice
        commitSource = 'user'
      } else if (hasUnmerged) {
        commit = 'keep'
        commitSource = 'auto'
      } else {
        commit = 'discard'
        commitSource = 'auto'
      }
    }

    await window.agentDeck.cost?.unbind?.(sessionId).catch((err: unknown) => {
      logWarn('cost.unbind failed', { err: String(err) })
    })

    useAppStore.getState().applySessionStatus(sessionId, 'exited', 'user-kill')

    await window.agentDeck.pty.kill(sessionId).catch((err: unknown) => {
      logWarn('pty.kill failed', { err: String(err) })
    })

    if (commit === 'discard' && commitSource === 'auto' && inspection && !inspection.hasUnmerged) {
      let reInspection: WorktreeInspection | null = null
      try {
        reInspection = await window.agentDeck.worktree.inspect(sessionId)
      } catch {
        reInspection = null
      }
      if (reInspection?.hasUnmerged) {
        commit = 'keep'
        logWarn('Session committed during close window; upgrading auto-discard -> keep', {
          sessionId,
        })
      }
    }

    if (commit === 'discard') {
      await window.agentDeck.worktree.discard(sessionId).catch((err: unknown) => {
        logWarn('worktree.discard failed', { err: String(err) })
      })
    } else if (commit === 'keep') {
      await window.agentDeck.worktree.keep(sessionId).catch((err: unknown) => {
        logWarn('worktree.keep failed', { err: String(err) })
      })
    }

    await window.agentDeck.worktree
      .releasePrimary(session.projectId, sessionId)
      .catch((err: unknown) => {
        logWarn('worktree.releasePrimary failed', { err: String(err) })
      })

    // Clear worktreePaths before prune to prevent TerminalPane cleanup from
    // re-triggering worktree ops on a dangling entry.
    useAppStore.getState().clearWorktreePath(sessionId)
    useAppStore.getState().pruneSessionFromTabs(sessionId)
  } finally {
    inFlight.delete(sessionId)
  }
}
