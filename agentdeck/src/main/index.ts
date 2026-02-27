import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { join } from 'path'
import { createPtyManager, type PtyManager } from './pty-manager'
import { createProjectStore, seedTemplates, type AppStore } from './project-store'
import { detectStack } from './detect-stack'
import { getDefaultDistro, wslPathToWindows } from './wsl-utils'
import { initLogger, createLogger } from './logger'

const log = createLogger('app')

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null
let appStore: AppStore | null = null

const agentBinaries: Record<string, string> = {
  'claude-code': 'claude',
  codex: 'codex',
  aider: 'aider',
  goose: 'goose',
  'gemini-cli': 'gemini',
  'amazon-q': 'q',
  opencode: 'opencode',
}

const ALLOWED_FILES = new Set(['CLAUDE.md', 'AGENTS.md', 'README.md'])

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: '#0d0e0f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  ptyManager = createPtyManager(mainWindow)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })

  mainWindow.webContents.once('did-finish-load', () => {
    const prefs = appStore?.get('appPrefs')
    let zoom = prefs?.zoomFactor ?? 1.0
    // Auto-detect high-DPI — re-trigger when detection version changes
    const DETECT_VERSION = 2
    const detected = prefs?.zoomAutoDetected
    const needsDetect = !detected || (typeof detected === 'number' && detected < DETECT_VERSION)
    if (needsDetect && mainWindow) {
      const display = screen.getPrimaryDisplay()
      // 4K (3840×2160+) or high scale factor → default to 1.5
      if (display.size.width >= 3840 || display.scaleFactor >= 2) {
        zoom = 1.5
      }
      appStore?.set('appPrefs', { ...prefs, zoomFactor: zoom, zoomAutoDetected: DETECT_VERSION })
    }
    if (zoom !== 1.0) mainWindow?.webContents.setZoomFactor(zoom)
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    ptyManager?.killAll()
    mainWindow = null
  })

  mainWindow.webContents.on('render-process-gone', () => {
    ptyManager?.killAll()
  })
}

function registerIpcHandlers(store: AppStore): void {
  /* ── PTY handlers ───────────────────────────────────────────────── */
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
      ptyManager?.spawn(sessionId, cols, rows, projectPath, startupCommands, env, agent, agentFlags)
    },
  )
  ipcMain.handle('pty:write', (_, sessionId: string, data: string) => {
    ptyManager?.write(sessionId, data)
  })
  ipcMain.handle('pty:resize', (_, sessionId: string, cols: number, rows: number) => {
    ptyManager?.resize(sessionId, cols, rows)
  })
  ipcMain.handle('pty:kill', (_, sessionId: string) => {
    ptyManager?.kill(sessionId)
  })

  /* ── Window controls ────────────────────────────────────────────── */
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  /* ── Zoom ─────────────────────────────────────────────────────────── */
  ipcMain.handle('zoom:get', () => store.get('appPrefs').zoomFactor)
  ipcMain.handle('zoom:set', (_, factor: number) => {
    const clamped = Math.round(Math.max(0.5, Math.min(2.5, factor)) * 10) / 10
    store.set('appPrefs', { ...store.get('appPrefs'), zoomFactor: clamped })
    mainWindow?.webContents.setZoomFactor(clamped)
    return clamped
  })
  ipcMain.handle('zoom:reset', () => {
    store.set('appPrefs', { ...store.get('appPrefs'), zoomFactor: 1.0 })
    mainWindow?.webContents.setZoomFactor(1.0)
    return 1.0
  })

  /* ── Theme ──────────────────────────────────────────────────────── */
  ipcMain.handle('theme:get', () => store.get('appPrefs').theme ?? '')
  ipcMain.handle('theme:set', (_, theme: string) => {
    const valid = ['', 'cyan', 'violet', 'ice', 'parchment', 'fog', 'lavender', 'stone']
    const safe = valid.includes(theme) ? theme : ''
    store.set('appPrefs', { ...store.get('appPrefs'), theme: safe })
    return safe
  })

  /* ── App info ─────────────────────────────────────────────────────── */
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:versions', () => ({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }))

  /* ── Agent detection (async, non-blocking) ──────────────────────── */
  ipcMain.handle('agents:check', async () => {
    const { execFile } = await import('child_process')
    const t0 = Date.now()

    // Diagnostic: WSL environment info
    const wslDiag = (label: string, args: string[]): Promise<string> =>
      new Promise((resolve) => {
        execFile('wsl.exe', args, { timeout: 10000 }, (err, stdout, stderr) => {
          const out = stdout?.trim() ?? ''
          const errMsg = err ? ` [err: ${(err as NodeJS.ErrnoException).code ?? err.message}]` : ''
          const stderrMsg = stderr?.trim() ? ` [stderr: ${stderr.trim()}]` : ''
          log.debug(`WSL diag ${label}: "${out}"${errMsg}${stderrMsg}`)
          resolve(out)
        })
      })

    await Promise.all([
      wslDiag('distro', ['--status']),
      wslDiag('default-shell', ['--', 'bash', '-c', 'echo $SHELL']),
      wslDiag('bash-version', ['--', 'bash', '--version']),
      wslDiag('PATH', ['--', 'bash', '-lic', 'echo "$PATH"']),
      wslDiag('npm-global-bin', ['--', 'bash', '-lic', 'npm bin -g 2>/dev/null']),
      wslDiag('node-version', ['--', 'bash', '-lic', 'node --version 2>/dev/null']),
    ])
    log.debug(`WSL diagnostics completed in ${Date.now() - t0}ms`)

    // Check each agent binary — first via PATH, then search common locations
    const check = (bin: string): Promise<boolean> =>
      new Promise((resolve) => {
        const t1 = Date.now()
        // 1) Try command -v in login+interactive bash.
        // -l (login) sources .profile which adds ~/.local/bin (standalone installer).
        // -i (interactive) sources .bashrc which loads nvm/fnm/volta PATH.
        // On Ubuntu, .profile also sources .bashrc, so -lic covers both.
        execFile(
          'wsl.exe',
          ['--', 'bash', '-lic', `command -v ${bin}`],
          { timeout: 15000 },
          (err, stdout, stderr) => {
            if (!err) {
              log.info(`Agent check: ${bin} → found (${stdout.trim()}) (${Date.now() - t1}ms)`)
              return resolve(true)
            }
            const errCode = (err as NodeJS.ErrnoException).code ?? err.message
            log.debug(
              `Agent check: ${bin} not in PATH [${errCode}]` +
                `${stderr?.trim() ? ` [stderr: ${stderr.trim()}]` : ''}` +
                ` — trying fallback search`,
            )
            // 2) Fallback: search common install locations.
            // Uses -e (exists) not -x (executable) to also catch symlinks.
            // Logs each path checked for diagnostics.
            const searchScript = [
              'found=""',
              // Standalone installer (official: curl https://claude.ai/install.sh | bash)
              // Symlink at ~/.local/bin, actual binary at ~/.local/share/<name>/versions/<ver>
              `[ -z "$found" ] && [ -e "$HOME/.local/bin/${bin}" ] && found="$HOME/.local/bin/${bin}"`,
              `[ -z "$found" ] && for f in "$HOME/.local/share/${bin}/versions/"*; do [ -f "$f" ] && found="$f" && break; done`,
              `[ -z "$found" ] && [ -e "$HOME/.claude/bin/${bin}" ] && found="$HOME/.claude/bin/${bin}"`,
              // nvm (any node version, not just active)
              `[ -z "$found" ] && for f in "$HOME/.nvm/versions/node"/*/bin/${bin}; do [ -e "$f" ] && found="$f" && break; done`,
              // System npm / custom npm prefix
              `[ -z "$found" ] && [ -e "/usr/local/bin/${bin}" ] && found="/usr/local/bin/${bin}"`,
              `[ -z "$found" ] && [ -e "$HOME/.npm-global/bin/${bin}" ] && found="$HOME/.npm-global/bin/${bin}"`,
              // volta / fnm / homebrew
              `[ -z "$found" ] && [ -e "$HOME/.volta/bin/${bin}" ] && found="$HOME/.volta/bin/${bin}"`,
              `[ -z "$found" ] && for f in "$HOME/.fnm/node-versions"/*/installation/bin/${bin}; do [ -e "$f" ] && found="$f" && break; done`,
              `[ -z "$found" ] && [ -e "/home/linuxbrew/.linuxbrew/bin/${bin}" ] && found="/home/linuxbrew/.linuxbrew/bin/${bin}"`,
              // Windows-side npm global (accessible from WSL via /mnt/c)
              `[ -z "$found" ] && for f in /mnt/c/Users/*/AppData/Roaming/npm/${bin}; do [ -e "$f" ] && found="$f" && break; done`,
              `[ -z "$found" ] && for f in /mnt/c/Users/*/AppData/Roaming/npm/${bin}.cmd; do [ -e "$f" ] && found="$f" && break; done`,
              // Windows standalone installer
              `[ -z "$found" ] && for f in /mnt/c/Users/*/AppData/Local/Programs/${bin}/${bin}.exe; do [ -e "$f" ] && found="$f" && break; done`,
              `[ -z "$found" ] && for f in /mnt/c/Users/*/.claude/local/${bin}.exe; do [ -e "$f" ] && found="$f" && break; done`,
              // Result
              `[ -n "$found" ] && echo "$found" && exit 0`,
              `exit 1`,
            ].join('; ')
            execFile(
              'wsl.exe',
              ['--', 'bash', '-c', searchScript],
              { timeout: 10000 },
              (err2, stdout2) => {
                const found = !err2 && !!stdout2.trim()
                log.info(
                  `Agent check: ${bin} → ${found ? `found via fallback (${stdout2.trim()})` : 'NOT FOUND anywhere'}` +
                    ` (${Date.now() - t1}ms)`,
                )
                resolve(found)
              },
            )
          },
        )
      })

    const entries = Object.entries(agentBinaries)
    const results = await Promise.all(entries.map(([, bin]) => check(bin)))
    log.info(`Agent detection total: ${Date.now() - t0}ms`)
    return Object.fromEntries(entries.map(([name], i) => [name, results[i]]))
  })

  /* ── Agent visibility ─────────────────────────────────────────── */
  ipcMain.handle('agents:getVisible', () => {
    return store.get('appPrefs').visibleAgents ?? null
  })
  ipcMain.handle('agents:setVisible', (_, agents: string[]) => {
    store.set('appPrefs', { ...store.get('appPrefs'), visibleAgents: agents })
    return agents
  })

  /* ── WSL username ─────────────────────────────────────────────── */
  ipcMain.handle('app:wslUsername', async () => {
    const { execFile } = await import('child_process')
    return new Promise<string>((resolve) => {
      execFile('wsl.exe', ['--', 'whoami'], { timeout: 5000 }, (err, stdout) => {
        resolve(err ? '' : stdout.trim())
      })
    })
  })

  /* ── Project utilities ──────────────────────────────────────────── */
  ipcMain.handle('projects:detectStack', (_, p: string, distro?: string) => {
    return detectStack(p, distro)
  })

  ipcMain.handle('projects:getDefaultDistro', () => {
    return getDefaultDistro()
  })

  ipcMain.handle('projects:readFile', async (_event, projectPath: string, filename: string) => {
    if (!ALLOWED_FILES.has(filename)) {
      throw new Error(`File not permitted: ${filename}`)
    }
    try {
      // Determine the Windows-readable path
      let windowsPath: string
      if (/^[A-Za-z]:/.test(projectPath)) {
        // Already a Windows path (e.g., E:\H\LocalAI)
        windowsPath = projectPath
      } else {
        // WSL path — convert to Windows
        const distro = getDefaultDistro()
        windowsPath = wslPathToWindows(projectPath, distro)
      }
      const filePath = path.join(windowsPath, filename)
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8')
        return content
      } catch (firstErr) {
        // If UNC path via wsl.localhost failed, try wsl$ fallback
        if (windowsPath.startsWith('\\\\wsl.localhost\\')) {
          const fallbackPath = windowsPath.replace('\\\\wsl.localhost\\', '\\\\wsl$\\')
          const fallbackFile = path.join(fallbackPath, filename)
          const content = await fs.promises.readFile(fallbackFile, 'utf-8')
          return content
        }
        throw firstErr
      }
    } catch (err) {
      // ENOENT is expected for optional files like AGENTS.md — don't log as error
      const errStr = String(err)
      if (errStr.includes('ENOENT')) {
        log.debug(`${filename} not found in ${projectPath}`)
      } else {
        log.error(`Failed to read ${filename} from ${projectPath}`, { err: errStr })
      }
      return null
    }
  })

  /* ── Dialogs ────────────────────────────────────────────────────── */
  ipcMain.handle('dialog:pickFolder', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
    return result.filePaths[0] ?? null
  })
}

app.whenReady().then(() => {
  initLogger()
  log.info('App ready')
  appStore = createProjectStore()
  seedTemplates(appStore)
  registerIpcHandlers(appStore)

  /* ── Renderer log relay ────────────────────────────────────────── */
  ipcMain.handle(
    'log:renderer',
    (_, level: string, mod: string, message: string, data?: unknown) => {
      const rendererLog = createLogger(`renderer:${mod}`)
      const methods: Record<string, (msg: string, d?: unknown) => void> = {
        info: rendererLog.info,
        warn: rendererLog.warn,
        error: rendererLog.error,
        debug: rendererLog.debug,
      }
      methods[level]?.(message, data)
    },
  )

  createWindow()
  log.info('Window created')
})

app.on('before-quit', () => {
  log.info('App quitting')
  ptyManager?.killAll()
})

app.on('window-all-closed', () => {
  app.quit()
})
