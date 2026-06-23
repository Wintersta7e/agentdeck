import { CH } from '../../shared/ipc-channels'
import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PtyManager } from '../pty-manager'
import { SAFE_ID_RE, MAX_SAFE_ID_LEN, validateId } from '../validation'
import { SAFE_FLAGS_RE } from '../../shared/agents'
import { ptyBus } from '../pty-bus'
import { invalidateGitCache } from '../git-status'
import { toWslPath } from '../wsl-utils'
import type { ReviewFile } from '../../shared/types'
import type { ReviewTracker } from '../review-tracker'
import type { SessionHistory } from '../session-history'
import type { UsageHistory } from '../usage-history'
import type { AgentRegistry } from '../agent-registry'
import { createLogger } from '../logger'

const execFileAsync = promisify(execFile)
const log = createLogger('ipc-pty')

/**
 * PTY IPC handlers: spawn, write, resize, kill.
 *
 * Uses a getter for ptyManager because the instance is created after module load.
 */

/** Keys blocked from renderer-supplied env to prevent process hijacking. */
const BLOCKED_ENV = new Set([
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'NODE_OPTIONS',
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ASAR',
])

/** Maximum bytes per pty:write chunk (1 MiB). */
const MAX_CHUNK = 1_048_576

/** Maximum number of startup commands accepted from renderer. */
const MAX_STARTUP_COMMANDS = 50
/** Maximum length of a single startup command. */
const MAX_STARTUP_CMD_LEN = 4096

interface SessionMeta {
  projectPath: string
  projectId: string
  agentId: string
}

interface PtyHandlerDeps {
  getMainWindow: () => BrowserWindow | null
  getProjectId: (projectPath: string) => string | null
  reviewTracker: ReviewTracker
  sessionHistory: SessionHistory
  usageHistory: UsageHistory
  agentRegistry: AgentRegistry
}

/**
 * Parse `git diff --name-status` output into ReviewFile entries.
 * Normal lines: "<status>\t<file>" where status is A/M/D.
 * Rename/copy lines carry the destination path after a second tab:
 * "R100\t<old>\t<new>" — we take the new path.
 */
/** Cap on review entries per PTY exit so a pathological repo can't exhaust memory. */
const MAX_REVIEW_FILES = 500
/** Per-path length cap. Git paths above this are almost certainly garbage. */
const MAX_REVIEW_PATH_LEN = 1024

export function parseNameStatus(output: string): ReviewFile[] {
  const files: ReviewFile[] = []
  for (const line of output.trim().split('\n')) {
    if (files.length >= MAX_REVIEW_FILES) break
    if (!line) continue
    const parts = line.split('\t')
    const code = parts[0]?.trim()
    if (!code) continue
    const raw = (parts.length > 2 ? parts[parts.length - 1] : parts[1])?.trim() ?? ''
    // Strip null bytes defensively; reject paths that exceed the length cap.
    const filePath = raw.replace(/\0/g, '')
    if (!filePath || filePath.length > MAX_REVIEW_PATH_LEN) continue
    let status: ReviewFile['status'] = 'modified'
    if (code.startsWith('A')) status = 'added'
    else if (code.startsWith('D')) status = 'deleted'
    files.push({ path: filePath, insertions: 0, deletions: 0, status })
  }
  return files
}

export function registerPtyHandlers(
  getPtyManager: () => PtyManager | null,
  deps: PtyHandlerDeps,
): void {
  ipcMain.handle(
    CH.ptySpawn,
    (
      _,
      sessionId: string,
      cols: number,
      rows: number,
      projectPath?: string,
      startupCommands?: string[],
      env?: Record<string, string>,
      agent?: string,
      agentFlags?: string,
    ) => {
      // Validate primitive identifiers before processing compound inputs
      // (env iteration, projectPath length check). Length-bound enforced by
      // validateId — a 10K-char sessionId would otherwise propagate into
      // ptyBus event names and channel keys.
      validateId(sessionId, 'sessionId')

      // Sanitise renderer-supplied env — block keys that could hijack the PTY process
      let safeEnv: Record<string, string> | undefined
      if (env && typeof env === 'object') {
        safeEnv = {}
        for (const [k, v] of Object.entries(env)) {
          if (typeof k === 'string' && typeof v === 'string' && !BLOCKED_ENV.has(k)) {
            safeEnv[k] = v
          }
        }
      }
      // Validate projectPath, agent, and startupCommands types
      if (
        projectPath !== undefined &&
        (typeof projectPath !== 'string' || projectPath.length > 1024)
      ) {
        throw new Error('Invalid projectPath')
      }
      if (agent !== undefined && (typeof agent !== 'string' || !deps.agentRegistry.has(agent))) {
        throw new Error('Invalid agent')
      }
      // Validate startupCommands — reject crafted payloads
      if (startupCommands !== undefined) {
        if (!Array.isArray(startupCommands) || startupCommands.length > MAX_STARTUP_COMMANDS) {
          throw new Error('Invalid startupCommands')
        }
        for (const cmd of startupCommands) {
          if (typeof cmd !== 'string' || cmd.length > MAX_STARTUP_CMD_LEN) {
            throw new Error('Invalid startupCommands entry')
          }
        }
      }
      // Validate agentFlags type, length, AND content at the IPC boundary so
      // shell metacharacters never reach the main process (SAFE_FLAGS_RE is
      // the only guard before wsl.exe bash -lc concatenation downstream).
      if (agentFlags !== undefined) {
        if (
          typeof agentFlags !== 'string' ||
          agentFlags.length > 512 ||
          !SAFE_FLAGS_RE.test(agentFlags)
        ) {
          throw new Error('Invalid agentFlags')
        }
      }
      const mgr = getPtyManager()
      if (!mgr) throw new Error('PTY manager not initialized')
      const spawnResult = mgr.spawn(
        sessionId,
        cols,
        rows,
        projectPath,
        startupCommands,
        safeEnv,
        agent,
        agentFlags,
      )

      // Track session metadata and register a one-shot exit listener for review detection.
      // ptyBus emits `exit:${sessionId}` from pty-manager.ts onExit handler.
      // Skip listener registration when spawn failed — pty-manager never emits
      // ptyBus.exit on a failed spawn (only the renderer-side exit channel),
      // so a `once` listener registered here would leak.
      if (projectPath && spawnResult.ok && !spawnResult.reused) {
        const projectId = deps.getProjectId(projectPath)
        if (projectId) {
          const meta: SessionMeta = {
            projectPath,
            projectId,
            agentId: agent ?? 'unknown',
          }

          const startedAt = Date.now()
          deps.sessionHistory.startSession({
            sessionId,
            projectId,
            agent: agent ?? 'unknown',
            startedAt,
          })

          const { getMainWindow, reviewTracker: tracker } = deps
          const capturedSessionId = sessionId
          ptyBus.once(`exit:${capturedSessionId}`, (exitCode: number | null) => {
            // null = SIGTERM/user-kill; 0 = clean exit. Both are normal session ends —
            // the session did real work and should count toward productivity.
            const status: 'exited' | 'error' =
              exitCode === null || exitCode === 0 ? 'exited' : 'error'
            const rec = deps.sessionHistory.endSession(capturedSessionId, {
              endedAt: Date.now(),
              status,
            })
            // Record all ended sessions — status is informational for the history
            // display, not a gate on whether the session gets counted.
            if (rec) {
              deps.usageHistory.recordSession({
                sessionId: rec.sessionId,
                agent: rec.agent,
                projectId: rec.projectId,
                startedAt: rec.startedAt,
                lastActivityAt: rec.lastActivityAt,
                filesChanged: rec.filesChanged,
              })
            }

            void (async () => {
              try {
                invalidateGitCache(meta.projectPath)
                const wslProjectPath = toWslPath(meta.projectPath)
                const { stdout } = await execFileAsync(
                  'wsl.exe',
                  ['--', 'git', '-C', wslProjectPath, 'diff', '--name-status', 'HEAD'],
                  { timeout: 10000 },
                )
                const files = parseNameStatus(stdout)
                if (files.length === 0) return

                tracker.addReview({
                  sessionId: capturedSessionId,
                  agentId: meta.agentId,
                  projectId: meta.projectId,
                  files,
                  totalInsertions: 0,
                  totalDeletions: 0,
                })

                const win = getMainWindow()
                if (win && !win.isDestroyed()) {
                  // Signal-only — renderer re-fetches per-project to avoid leaking
                  // cross-project file paths in the broadcast payload.
                  win.webContents.send(CH.homeReviewsUpdated, [])
                }
              } catch (err) {
                // PTY exit must never block — but log so a silently broken
                // Pending Reviews panel has a trail in the main-process log
                // instead of looking like "nothing happened on exit".
                log.warn('Review-tracker exit handler failed', {
                  sessionId: capturedSessionId,
                  err: err instanceof Error ? err.message : String(err),
                })
              }
            })()
          })
        }
      }

      return spawnResult
    },
  )

  ipcMain.handle(
    CH.ptyWrite,
    (_, sessionId: string, data: string): { ok: boolean; error?: string } => {
      try {
        validateId(sessionId, 'sessionId')
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Invalid sessionId' }
      }
      if (typeof data !== 'string') {
        return { ok: false, error: 'Invalid data (expected string)' }
      }
      const mgr = getPtyManager()
      if (!mgr) {
        return { ok: false, error: 'PTY manager not initialised' }
      }
      if (!mgr.hasSession(sessionId)) {
        return { ok: false, error: 'Session not found' }
      }
      try {
        // Chunk oversized writes to avoid locking the PTY with a single huge buffer.
        // Normal keystrokes and small pastes go through the fast path.
        if (data.length <= MAX_CHUNK) {
          mgr.write(sessionId, data)
        } else {
          for (let i = 0; i < data.length; i += MAX_CHUNK) {
            mgr.write(sessionId, data.slice(i, i + MAX_CHUNK))
          }
        }
        return { ok: true }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  )

  // Note: resize rate-limiting is handled renderer-side (80ms debounced ResizeObserver).
  // No server-side guard — node-pty resize is cheap and idempotent.
  ipcMain.on(CH.ptyResize, (_, sessionId: string, cols: number, rows: number) => {
    // Fire-and-forget — silently drop invalid sessionId rather than throw
    // (the renderer-side ResizeObserver fires on every layout shift).
    if (typeof sessionId !== 'string' || !SAFE_ID_RE.test(sessionId)) return
    if (sessionId.length > MAX_SAFE_ID_LEN) return
    if (cols > 0 && rows > 0) getPtyManager()?.resize(sessionId, cols, rows)
  })

  ipcMain.handle(CH.ptyKill, (_, sessionId: string) => {
    validateId(sessionId, 'sessionId')
    getPtyManager()?.kill(sessionId)
  })
}
