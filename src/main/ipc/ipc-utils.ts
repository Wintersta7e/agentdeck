import { ipcMain } from 'electron'
import { toWslPath } from '../wsl-utils'
import { createLogger } from '../logger'

const log = createLogger('ipc-utils')

/** Allowed log levels from the renderer process. */
const ALLOWED_LOG_LEVELS = new Set(['info', 'warn', 'error', 'debug'])
const MAX_MOD_LENGTH = 64
const MAX_MSG_LENGTH = 4096
const MAX_LOGGERS = 50

/**
 * Utility IPC handlers: clipboard file paths, renderer log relay.
 */
export function registerUtilHandlers(): void {
  /* ── Clipboard: read file paths from copied files ────────────── */
  ipcMain.handle('clipboard:readFilePaths', async () => {
    const { execFile } = await import('child_process')
    return new Promise<string[]>((resolve) => {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NoLogo',
          '-Command',
          'Get-Clipboard -Format FileDropList | ForEach-Object { $_.FullName }',
        ],
        { timeout: 5000 },
        (err, stdout) => {
          if (err || !stdout?.trim()) {
            log.debug('clipboard:readFilePaths — no file paths found')
            resolve([])
            return
          }
          const paths = stdout
            .trim()
            .split(/\r?\n/)
            .map((p) => toWslPath(p.trim()))
          log.info(`clipboard:readFilePaths → ${JSON.stringify(paths)}`)
          resolve(paths)
        },
      )
    })
  })

  /* ── Renderer log relay ────────────────────────────────────────── */
  const rendererLoggers = new Map<string, ReturnType<typeof createLogger>>()
  ipcMain.handle(
    'log:renderer',
    (_, level: string, mod: string, message: string, data?: unknown) => {
      if (typeof level !== 'string' || !ALLOWED_LOG_LEVELS.has(level)) return
      if (typeof mod !== 'string' || mod.length > MAX_MOD_LENGTH) return
      if (typeof message !== 'string') return
      const safeMod = mod.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, MAX_MOD_LENGTH)
      const safeMsg = message.slice(0, MAX_MSG_LENGTH)
      let rendererLog = rendererLoggers.get(safeMod)
      if (!rendererLog) {
        if (rendererLoggers.size >= MAX_LOGGERS) return // prevent unbounded growth
        rendererLog = createLogger(`renderer:${safeMod}`)
        rendererLoggers.set(safeMod, rendererLog)
      }
      rendererLog[level as 'info' | 'warn' | 'error' | 'debug'](safeMsg, data)
    },
  )
}
