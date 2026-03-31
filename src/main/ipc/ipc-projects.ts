import { dialog, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { Project, ProjectMeta } from '../../shared/types'
import type { AppStore } from '../project-store'
import { detectStack } from '../detect-stack'
import { scanSkillDirectory, invalidateProjectCache } from '../skill-scanner'
import { getDefaultDistroAsync, wslPathToWindows } from '../wsl-utils'
import { createLogger } from '../logger'

const log = createLogger('ipc-projects')

/** Files that the renderer is permitted to read from a project folder. */
const ALLOWED_FILES = new Set(['CLAUDE.md', 'AGENTS.md', 'README.md'])

/**
 * Project utility IPC handlers: stack detection, distro, file reading, folder picker.
 */
export function registerProjectHandlers(
  getWindow: () => BrowserWindow | null,
  getStore?: (() => AppStore | null) | undefined,
): void {
  ipcMain.handle('projects:detectStack', async (_, p: string, distro?: string) => {
    const resolvedDistro = distro || (await getDefaultDistroAsync())
    return detectStack(p, resolvedDistro)
  })

  ipcMain.handle('projects:getDefaultDistro', async () => {
    return getDefaultDistroAsync()
  })

  ipcMain.handle('projects:readFile', async (_event, projectPath: string, filename: string) => {
    if (typeof projectPath !== 'string' || !projectPath) {
      throw new Error('projects:readFile requires a non-empty projectPath')
    }
    if (/(?:^|\/)\.\.(?:\/|$)/.test(projectPath)) {
      throw new Error('projects:readFile rejects path traversal in projectPath')
    }
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
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    })
    return result.filePaths[0] ?? null
  })

  /* ── Project Metadata Refresh ──────────────────────────────────── */
  ipcMain.handle('projects:refreshMeta', async (_, projectId: string) => {
    if (typeof projectId !== 'string' || !projectId) {
      throw new Error('projects:refreshMeta requires a projectId string')
    }

    const store = getStore?.()
    if (!store) throw new Error('Store not available')

    const projects: Project[] = store.get('projects') ?? []
    const project = projects.find((p) => p.id === projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)

    const distro = project.wslDistro || (await getDefaultDistroAsync())
    const projectPath = project.path

    // 1. Check which context files exist
    const contextFiles: string[] = []
    const filesToCheck = ['CLAUDE.md', 'AGENTS.md']
    if (
      project.contextFile &&
      !filesToCheck.includes(project.contextFile) &&
      !project.contextFile.includes('/') &&
      !project.contextFile.includes('\\') &&
      !project.contextFile.includes('..')
    ) {
      filesToCheck.push(project.contextFile)
    }
    for (const filename of filesToCheck) {
      const windowsPath = /^[A-Za-z]:/.test(projectPath)
        ? projectPath
        : wslPathToWindows(projectPath, distro)
      const candidates = [
        path.join(windowsPath, filename),
        path.join(windowsPath, '.claude', filename),
      ]
      let found = false
      for (const filePath of candidates) {
        if (found) break
        try {
          await fs.promises.access(filePath, fs.constants.F_OK)
          contextFiles.push(filename)
          found = true
        } catch {
          if (filePath.startsWith('\\\\wsl.localhost\\')) {
            try {
              const fallback = filePath.replace('\\\\wsl.localhost\\', '\\\\wsl$\\')
              await fs.promises.access(fallback, fs.constants.F_OK)
              contextFiles.push(filename)
              found = true
            } catch {
              // not found via wsl$ fallback
            }
          }
        }
      }
    }

    // 2. Scan project-local skills
    const skillRoot = `${projectPath}/.agents/skills`
    const scanResult = await scanSkillDirectory(skillRoot, 'project', distro)

    // 3. Re-detect stack
    try {
      const detected = await detectStack(projectPath, distro)
      if (detected?.badge && detected.badge !== project.badge) {
        const updated = projects.map((p) =>
          p.id === projectId ? { ...p, badge: detected.badge } : p,
        )
        store.set('projects', updated)
      }
    } catch (err) {
      log.warn('Stack re-detection failed during refreshMeta', { err: String(err) })
    }

    // 4. Build and persist ProjectMeta
    const meta: ProjectMeta = {
      contextFiles,
      skills: scanResult.skills,
      scanStatus: scanResult.status,
      scanError: scanResult.error,
      skippedSkills: scanResult.skipped > 0 ? scanResult.skipped : undefined,
      lastScanned: Date.now(),
    }

    const updatedProjects = (store.get('projects') ?? []).map((p: Project) =>
      p.id === projectId ? { ...p, meta } : p,
    )
    store.set('projects', updatedProjects)

    // 5. Invalidate cache
    invalidateProjectCache(projectPath)

    log.info('Project metadata refreshed', {
      projectId,
      contextFiles,
      skillCount: scanResult.skills.length,
      skipped: scanResult.skipped,
      status: scanResult.status,
    })

    return meta
  })
}
