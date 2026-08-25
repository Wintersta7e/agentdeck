import type { WorktreeManager } from './worktree-manager'

export interface WorktreeProviderDeps {
  /** Attempts to build a manager; resolves null when the environment isn't ready. */
  create: () => Promise<WorktreeManager | null>
  /** Called once, the first time a manager is successfully created. */
  onReady?: ((manager: WorktreeManager) => void) | undefined
}

export interface WorktreeProvider {
  /** The manager, initialising it on demand. Null while the environment isn't ready. */
  get: () => Promise<WorktreeManager | null>
}

/**
 * Lazily initialises the worktree manager and keeps retrying until it succeeds.
 *
 * The first `wsl.exe` call after a Windows boot can be slow enough that
 * `$HOME` never resolves during startup. Initialising once at boot therefore
 * disabled worktree isolation for the whole app session: every later
 * `worktree:acquire` threw "WorktreeManager not initialized" and sessions ran
 * straight against the user's branch without the review step. Deferring the
 * attempt to first use — a session start, long after WSL has warmed up —
 * removes that window, and a failed attempt stays retryable rather than
 * latching off.
 */
export function createWorktreeProvider({
  create,
  onReady,
}: WorktreeProviderDeps): WorktreeProvider {
  let manager: WorktreeManager | null = null
  let inFlight: Promise<WorktreeManager | null> | null = null

  return {
    get: () => {
      if (manager) return Promise.resolve(manager)
      // Single-flight: concurrent session starts share one attempt rather than
      // racing several cold `wsl.exe` calls.
      inFlight ??= create()
        .catch(() => null)
        .then((created) => {
          if (created) {
            manager = created
            onReady?.(created)
          }
          return created
        })
        .finally(() => {
          inFlight = null
        })
      return inFlight
    },
  }
}
