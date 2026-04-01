import { ipcMain } from 'electron'
import type { PtyManager } from '../pty-manager'
import { SAFE_ID_RE } from '../validation'
import { KNOWN_AGENT_IDS } from '../../shared/agents'

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

export function registerPtyHandlers(getPtyManager: () => PtyManager | null): void {
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
      const mgr = getPtyManager()
      if (!mgr) throw new Error('PTY manager not initialized')
      mgr.spawn(sessionId, cols, rows, projectPath, startupCommands, safeEnv, agent, agentFlags)
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
