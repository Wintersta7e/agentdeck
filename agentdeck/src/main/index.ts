import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { join } from 'path'
import { createPtyManager, type PtyManager } from './pty-manager'
import { createProjectStore, seedRoles, seedTemplates, type AppStore } from './project-store'
import { detectStack } from './detect-stack'
import { getDefaultDistro, wslPathToWindows } from './wsl-utils'
import { initLogger, createLogger, closeLogger } from './logger'
import {
  listWorkflows,
  loadWorkflow,
  saveWorkflow,
  renameWorkflow,
  deleteWorkflow,
} from './workflow-store'
import { createWorkflowEngine, validateWorkflow } from './workflow-engine'
import type { WorkflowEngine } from './workflow-engine'
import type { Workflow } from '../shared/types'
import { AGENT_BINARY_MAP, KNOWN_AGENT_IDS } from '../shared/agents'
import { updateAgent, checkAllUpdates } from './agent-updater'

const log = createLogger('app')

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null
let workflowEngine: WorkflowEngine | null = null
let appStore: AppStore | null = null

const ALLOWED_FILES = new Set(['CLAUDE.md', 'AGENTS.md', 'README.md'])

/** Convert a Windows path (C:\Users\...) to WSL (/mnt/c/Users/...) */
function toWslPathMain(p: string): string {
  const normalized = p.replace(/\\/g, '/')
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/)
  if (match && match[1] && match[2] !== undefined) {
    return `/mnt/${match[1].toLowerCase()}/${match[2]}`
  }
  return normalized
}

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
  workflowEngine = createWorkflowEngine(ptyManager, mainWindow, () => appStore?.get('roles') ?? [])

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

  // Intercept file drops: the browser tries to navigate or open a new window
  // for the dropped file's file:// URL. Catch both pathways.
  const handleFileUrl = (url: string): void => {
    if (!url.startsWith('file://')) return
    let pathname = decodeURIComponent(new URL(url).pathname)
    if (/^\/[A-Za-z]:/.test(pathname)) pathname = pathname.slice(1)
    const wslPath = toWslPathMain(pathname)
    log.info(`File drop intercepted: ${url} → ${wslPath}`)
    mainWindow?.webContents.send('file-dropped', [wslPath])
  }

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) {
      event.preventDefault()
      handleFileUrl(url)
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    handleFileUrl(url)
    return { action: 'deny' }
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
  ipcMain.on('pty:write', (_, sessionId: string, data: string) => {
    ptyManager?.write(sessionId, data)
  })
  ipcMain.on('pty:resize', (_, sessionId: string, cols: number, rows: number) => {
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

    // Run diagnostics in parallel with agent checks (diagnostics are for logging only,
    // they don't gate the agent results)
    const diagnosticsPromise = Promise.all([
      wslDiag('distro', ['--status']),
      wslDiag('default-shell', ['--', 'bash', '-c', 'echo $SHELL']),
      wslDiag('bash-version', ['--', 'bash', '--version']),
      wslDiag('PATH', ['--', 'bash', '-lic', 'echo "$PATH"']),
      wslDiag('npm-global-bin', ['--', 'bash', '-lic', 'npm bin -g 2>/dev/null']),
      wslDiag('node-version', ['--', 'bash', '-lic', 'node --version 2>/dev/null']),
    ]).then(() => log.debug(`WSL diagnostics completed in ${Date.now() - t0}ms`))

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

    const entries = Object.entries(AGENT_BINARY_MAP)
    const [, results] = await Promise.all([
      diagnosticsPromise,
      Promise.all(entries.map(([, bin]) => check(bin))),
    ])
    log.info(`Agent detection total: ${Date.now() - t0}ms`)
    return Object.fromEntries(entries.map(([name], i) => [name, results[i]]))
  })

  /* ── Layout persistence ───────────────────────────────────────── */
  ipcMain.handle('layout:get', () => {
    const p = store.get('appPrefs')
    return {
      sidebarOpen: p.sidebarOpen,
      sidebarWidth: p.sidebarWidth,
      sidebarSections: p.sidebarSections,
      rightPanelWidth: p.rightPanelWidth,
      wfLogPanelWidth: p.wfLogPanelWidth,
    }
  })
  const LAYOUT_KEYS = new Set([
    'sidebarOpen',
    'sidebarWidth',
    'sidebarSections',
    'rightPanelWidth',
    'wfLogPanelWidth',
  ])
  ipcMain.handle('layout:set', (_, patch: Record<string, unknown>) => {
    const current = store.get('appPrefs')
    const filtered: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) {
      if (LAYOUT_KEYS.has(k)) filtered[k] = v
    }
    store.set('appPrefs', { ...current, ...filtered })
  })

  /* ── Agent visibility ─────────────────────────────────────────── */
  ipcMain.handle('agents:getVisible', () => {
    return store.get('appPrefs').visibleAgents ?? null
  })
  ipcMain.handle('agents:setVisible', (_, agents: string[]) => {
    if (!Array.isArray(agents)) return store.get('appPrefs').visibleAgents ?? null
    const safe = agents.filter((a) => typeof a === 'string' && KNOWN_AGENT_IDS.has(a))
    store.set('appPrefs', { ...store.get('appPrefs'), visibleAgents: safe })
    return safe
  })

  /* -- Agent version checks (fire-and-forget) ---------------------- */
  ipcMain.handle('agents:checkUpdates', (_, installedAgents: Record<string, boolean>) => {
    if (mainWindow) checkAllUpdates(mainWindow, installedAgents)
  })

  ipcMain.handle('agents:update', async (_, agentId: string) => {
    if (!KNOWN_AGENT_IDS.has(agentId)) {
      return { agentId, success: false, newVersion: null, message: 'Unknown agent' }
    }
    return updateAgent(agentId)
  })

  /* ── WSL username ─────────────────────────────────────────────── */
  ipcMain.handle('app:wslUsername', async () => {
    const { execFile } = await import('child_process')
    const tryCmd = (args: string[]): Promise<string> =>
      new Promise((resolve) => {
        execFile('wsl.exe', args, { timeout: 5000 }, (err, stdout) => {
          const out = stdout?.trim() ?? ''
          if (err || !out) {
            resolve('')
            return
          }
          resolve(out)
        })
      })

    // Try multiple approaches — some WSL configs fail on one but succeed on another
    const result =
      (await tryCmd(['--', 'bash', '-lc', 'whoami'])) ||
      (await tryCmd(['--', 'whoami'])) ||
      (await tryCmd(['--', 'bash', '-lc', 'echo $USER']))
    if (!result) log.warn('Failed to detect WSL username')
    return result
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

      // Try root path first, then .claude/ subdirectory (Claude Code convention)
      const candidates = [
        path.join(windowsPath, filename),
        path.join(windowsPath, '.claude', filename),
      ]

      for (const filePath of candidates) {
        try {
          const content = await fs.promises.readFile(filePath, 'utf-8')
          return content
        } catch {
          // If UNC path via wsl.localhost failed, try wsl$ fallback
          if (filePath.startsWith('\\\\wsl.localhost\\')) {
            try {
              const fallbackFile = filePath.replace('\\\\wsl.localhost\\', '\\\\wsl$\\')
              const content = await fs.promises.readFile(fallbackFile, 'utf-8')
              return content
            } catch {
              // continue to next candidate
            }
          }
          // continue to next candidate
        }
      }

      log.debug(`${filename} not found in ${projectPath}`)
      return null
    } catch (err) {
      log.error(`Failed to read ${filename} from ${projectPath}`, { err: String(err) })
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

  /* ── Workflow CRUD ──────────────────────────────────────────────── */
  ipcMain.handle('workflows:list', () => listWorkflows())
  ipcMain.handle('workflows:load', (_, id: string) => loadWorkflow(id))
  ipcMain.handle('workflows:save', (_, workflow: Workflow) => saveWorkflow(workflow))
  ipcMain.handle('workflows:rename', (_, id: string, name: string) => renameWorkflow(id, name))
  ipcMain.handle('workflows:delete', async (_, id: string) => {
    // C6: Stop running workflow before deleting to avoid orphaned PTYs
    workflowEngine?.stop(id)
    await deleteWorkflow(id)
  })

  /* ── Workflow Execution ────────────────────────────────────────── */
  ipcMain.handle('workflow:run', async (_, workflowId: string, projectPath?: string) => {
    const workflow = await loadWorkflow(workflowId)
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`)
    if (!workflowEngine) throw new Error('Workflow engine not initialized')
    // C2: Validate workflow structure before execution
    validateWorkflow(workflow)
    // Convert Windows path to WSL if needed (projects store Windows paths)
    const wslPath = projectPath ? toWslPathMain(projectPath) : undefined
    // H1: Validate projectPath if provided (WSL absolute path, allow spaces, reject ..)
    if (
      wslPath !== undefined &&
      (!/^\/[^\x00;|&`$<>\\]+$/.test(wslPath) || wslPath.includes('..'))
    ) {
      throw new Error(`Invalid project path: ${wslPath}`)
    }
    workflowEngine.run(workflow, wslPath)
  })
  ipcMain.handle('workflow:stop', (_, workflowId: string) => {
    workflowEngine?.stop(workflowId)
  })
  ipcMain.handle('workflow:resume', (_, workflowId: string, nodeId: string) => {
    workflowEngine?.resume(workflowId, nodeId)
  })

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
            .map((p) => toWslPathMain(p.trim()))
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
      let rendererLog = rendererLoggers.get(mod)
      if (!rendererLog) {
        rendererLog = createLogger(`renderer:${mod}`)
        rendererLoggers.set(mod, rendererLog)
      }
      const methods: Record<string, (msg: string, d?: unknown) => void> = {
        info: rendererLog.info,
        warn: rendererLog.warn,
        error: rendererLog.error,
        debug: rendererLog.debug,
      }
      methods[level]?.(message, data)
    },
  )
}

app.whenReady().then(() => {
  initLogger()
  log.info('App ready')
  appStore = createProjectStore()
  seedTemplates(appStore)
  seedRoles(appStore)
  registerIpcHandlers(appStore)

  createWindow()
  log.info('Window created')
})

app.on('before-quit', () => {
  log.info('App quitting')
  workflowEngine?.stopAll()
  ptyManager?.killAll()
  closeLogger()
})

app.on('window-all-closed', () => {
  app.quit()
})
