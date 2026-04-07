import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PtyManager } from '../pty-manager'
import { SAFE_ID_RE } from '../validation'
import { KNOWN_AGENT_IDS } from '../../shared/agents'
import { ptyBus } from '../pty-bus'
import { invalidateGitCache } from '../git-status'
import type { ReviewFile } from '../../shared/types'
import type { ReviewTracker } from '../review-tracker'

const execFileAsync = promisify(execFile)

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
}

/**
 * Parse `git diff --name-stat` output into ReviewFile entries.
 * Lines are in format: "<status>\t<file>" where status is A/M/D/R/C.
 */
function parseNameStat(output: string): ReviewFile[] {
  const files: ReviewFile[] = []
  for (const line of output.trim().split('\n')) {
    if (!line) continue
    const tab = line.indexOf('\t')
    if (tab === -1) continue
    const code = line.slice(0, tab).trim()
    const filePath = line.slice(tab + 1).trim()
    if (!filePath) continue
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
    'pty:spawn',
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
      // C1: Sanitise renderer-supplied env — block keys that could hijack the PTY process
      let safeEnv: Record<string, string> | undefined
      if (env && typeof env === 'object') {
        safeEnv = {}
        for (const [k, v] of Object.entries(env)) {
          if (typeof k === 'string' && typeof v === 'string' && !BLOCKED_ENV.has(k)) {
            safeEnv[k] = v
          }
        }
      }
      if (typeof sessionId !== 'string' || !SAFE_ID_RE.test(sessionId)) {
        throw new Error('Invalid sessionId')
      }
      // SEC-32: Validate projectPath, agent, and startupCommands types
      if (
        projectPath !== undefined &&
        (typeof projectPath !== 'string' || projectPath.length > 1024)
      ) {
        throw new Error('Invalid projectPath')
      }
      if (agent !== undefined && (typeof agent !== 'string' || !KNOWN_AGENT_IDS.has(agent))) {
        throw new Error('Invalid agent')
      }
      // SEC-30: Validate startupCommands — reject crafted payloads
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
      // R2-21: Validate agentFlags type and length
      if (agentFlags !== undefined && (typeof agentFlags !== 'string' || agentFlags.length > 512)) {
        throw new Error('Invalid agentFlags')
      }
      const mgr = getPtyManager()
      if (!mgr) throw new Error('PTY manager not initialized')
      mgr.spawn(sessionId, cols, rows, projectPath, startupCommands, safeEnv, agent, agentFlags)

      // Track session metadata and register a one-shot exit listener for review detection.
      // ptyBus emits `exit:${sessionId}` from pty-manager.ts onExit handler.
      if (projectPath) {
        const projectId = deps.getProjectId(projectPath)
        if (projectId) {
          const meta: SessionMeta = {
            projectPath,
            projectId,
            agentId: agent ?? 'unknown',
          }

          const { getMainWindow, reviewTracker: tracker } = deps
          const capturedSessionId = sessionId
          ptyBus.once(`exit:${capturedSessionId}`, () => {
            void (async () => {
              try {
                invalidateGitCache(meta.projectPath)
                const { stdout } = await execFileAsync(
                  'wsl.exe',
                  ['--', 'git', '-C', meta.projectPath, 'diff', '--name-stat', 'HEAD'],
                  { timeout: 10000 },
                )
                const files = parseNameStat(stdout)
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
                  win.webContents.send('home:reviewsUpdated', [])
                }
              } catch {
                // Best-effort: swallow all errors so PTY exit is never blocked
              }
            })()
          })
        }
      }
    },
  )

  ipcMain.on('pty:write', (_, sessionId: string, data: string) => {
    if (typeof sessionId !== 'string' || !SAFE_ID_RE.test(sessionId)) return
    if (typeof data !== 'string') return
    // Chunk oversized writes to avoid locking the PTY with a single huge buffer.
    // Normal keystrokes and small pastes go through the fast path.
    const mgr = getPtyManager()
    if (!mgr) return
    if (data.length <= MAX_CHUNK) {
      mgr.write(sessionId, data)
    } else {
      for (let i = 0; i < data.length; i += MAX_CHUNK) {
        mgr.write(sessionId, data.slice(i, i + MAX_CHUNK))
      }
    }
  })

  // Note: resize rate-limiting is handled renderer-side (80ms debounced ResizeObserver).
  // No server-side guard — node-pty resize is cheap and idempotent.
  ipcMain.on('pty:resize', (_, sessionId: string, cols: number, rows: number) => {
    if (typeof sessionId !== 'string' || !SAFE_ID_RE.test(sessionId)) return
    if (cols > 0 && rows > 0) getPtyManager()?.resize(sessionId, cols, rows)
  })

  ipcMain.handle('pty:kill', (_, sessionId: string) => {
    if (typeof sessionId !== 'string' || !SAFE_ID_RE.test(sessionId)) {
      throw new Error('Invalid sessionId')
    }
    getPtyManager()?.kill(sessionId)
  })
}
