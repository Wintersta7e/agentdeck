import { dialog, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { detectStack } from '../detect-stack'
import { getDefaultDistroAsync, wslPathToWindows } from '../wsl-utils'
import { createLogger } from '../logger'

const log = createLogger('ipc-projects')

/** Files that the renderer is permitted to read from a project folder. */
const ALLOWED_FILES = new Set(['CLAUDE.md', 'AGENTS.md', 'README.md'])

/**
 * Project utility IPC handlers: stack detection, distro, file reading, folder picker.
 */
export function registerProjectHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('projects:detectStack', async (_, p: string, distro?: string) => {
    const resolvedDistro = distro || (await getDefaultDistroAsync())
    return detectStack(p, resolvedDistro)
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
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    })
    return result.filePaths[0] ?? null
  })
}
