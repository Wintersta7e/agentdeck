import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { join } from 'path'
import { createPtyManager, type PtyManager } from './pty-manager'
import { createProjectStore, type AppStore } from './project-store'
import { seedTemplates, seedRoles } from './store-seeds'
import { detectStack } from './detect-stack'
import { getDefaultDistroAsync, toWslPath, wslPathToWindows } from './wsl-utils'
import { initLogger, createLogger, closeLogger } from './logger'
import {
  listWorkflows,
  loadWorkflow,
  saveWorkflow,
  renameWorkflow,
  deleteWorkflow,
} from './workflow-store'
import { seedWorkflows } from './workflow-seeds'
import { createWorkflowEngine } from './workflow-engine'
import type { WorkflowEngine } from './workflow-engine'
import { validateWorkflow } from '../shared/workflow-utils'
import type { Workflow } from '../shared/types'
import { KNOWN_AGENT_IDS } from '../shared/agents'
import { updateAgent, checkAllUpdates } from './agent-updater'
import { detectAgents } from './agent-detector'

const log = createLogger('app')

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null
let workflowEngine: WorkflowEngine | null = null
let appStore: AppStore | null = null

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
      sandbox: true,
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
    const wslPath = toWslPath(pathname)
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
      // C1: Sanitise renderer-supplied env — block keys that could hijack the PTY process
      const BLOCKED_ENV = new Set([
        'LD_PRELOAD',
        'LD_LIBRARY_PATH',
        'NODE_OPTIONS',
        'ELECTRON_RUN_AS_NODE',
        'ELECTRON_NO_ASAR',
      ])
      let safeEnv: Record<string, string> | undefined
      if (env && typeof env === 'object') {
        safeEnv = {}
        for (const [k, v] of Object.entries(env)) {
          if (typeof k === 'string' && typeof v === 'string' && !BLOCKED_ENV.has(k)) {
            safeEnv[k] = v
          }
        }
      }
      ptyManager?.spawn(
        sessionId,
        cols,
        rows,
        projectPath,
        startupCommands,
        safeEnv,
        agent,
        agentFlags,
      )
    },
  )
  ipcMain.on('pty:write', (_, sessionId: string, data: string) => {
    if (typeof sessionId !== 'string' || !sessionId) return
    ptyManager?.write(sessionId, data)
  })
  // Note: resize rate-limiting is handled renderer-side (80ms debounced ResizeObserver).
  // No server-side guard — node-pty resize is cheap and idempotent.
  ipcMain.on('pty:resize', (_, sessionId: string, cols: number, rows: number) => {
    if (typeof sessionId !== 'string' || !sessionId) return
    if (cols > 0 && rows > 0) ptyManager?.resize(sessionId, cols, rows)
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
  ipcMain.handle('agents:check', () => detectAgents(log))

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
      if (!LAYOUT_KEYS.has(k)) continue
      if (k === 'sidebarOpen') {
        if (typeof v !== 'boolean') continue
      } else if (k === 'sidebarWidth' || k === 'rightPanelWidth' || k === 'wfLogPanelWidth') {
        if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 5000) continue
      } else if (k === 'sidebarSections') {
        if (!v || typeof v !== 'object' || Array.isArray(v)) continue
        if (!Object.values(v as Record<string, unknown>).every((val) => typeof val === 'boolean'))
          continue
      }
      filtered[k] = v
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
  ipcMain.handle('agents:checkUpdates', (_, installedAgents: unknown) => {
    if (!installedAgents || typeof installedAgents !== 'object' || Array.isArray(installedAgents))
      return
    if (mainWindow) checkAllUpdates(mainWindow, installedAgents as Record<string, boolean>)
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
        execFile('wsl.exe', args, { timeout: 15000 }, (err, stdout) => {
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

  ipcMain.handle('projects:getDefaultDistro', async () => {
    return getDefaultDistroAsync()
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
        const distro = await getDefaultDistroAsync()
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
  ipcMain.handle('workflows:rename', (_, id: string, name: string) => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid workflow id')
    if (typeof name !== 'string' || !name.trim() || name.length > 200)
      throw new Error('Invalid workflow name')
    return renameWorkflow(id, name)
  })
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
    const wslPath = projectPath ? toWslPath(projectPath) : undefined
    // C2: Validate projectPath — must be absolute WSL path, no traversal or shell metacharacters.
    // The workflow engine's shellQuote handles safe quoting; this rejects obviously malicious input.
    if (wslPath !== undefined) {
      if (typeof wslPath !== 'string' || wslPath.length > 1024 || !wslPath.startsWith('/')) {
        throw new Error(`Invalid project path: must be an absolute WSL path`)
      }
      if (wslPath.includes('..')) {
        throw new Error(`Invalid project path: path traversal not allowed`)
      }
    }
    workflowEngine.run(workflow, wslPath)
  })
  ipcMain.handle('workflow:stop', (_, workflowId: string) => {
    if (typeof workflowId !== 'string' || !workflowId) return
    workflowEngine?.stop(workflowId)
  })
  ipcMain.handle('workflow:resume', (_, workflowId: string, nodeId: string) => {
    if (typeof workflowId !== 'string' || !workflowId) return
    if (typeof nodeId !== 'string' || !nodeId) return
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
            .map((p) => toWslPath(p.trim()))
          log.info(`clipboard:readFilePaths → ${JSON.stringify(paths)}`)
          resolve(paths)
        },
      )
    })
  })

  /* ── Renderer log relay ────────────────────────────────────────── */
  const ALLOWED_LOG_LEVELS = new Set(['info', 'warn', 'error', 'debug'])
  const MAX_MOD_LENGTH = 64
  const MAX_MSG_LENGTH = 4096
  const MAX_LOGGERS = 50
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

app
  .whenReady()
  .then(async () => {
    initLogger()
    log.info('App ready')
    appStore = createProjectStore()
    seedTemplates(appStore)
    seedRoles(appStore)
    await seedWorkflows(appStore)
    registerIpcHandlers(appStore)

    createWindow()
    log.info('Window created')
  })
  .catch((err: unknown) => {
    log.error('Startup failed', { err: String(err) })
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
