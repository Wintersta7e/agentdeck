import { ipcMain, shell } from 'electron'
import path from 'node:path'
import { listDir, type DirEntry } from '../files-lister'
import { gitignoreCheck } from '../files-gitignore'
import { createLogger } from '../logger'
import { wslPathToWindows, getDefaultDistroAsync } from '../wsl-utils'

const log = createLogger('ipc-files')

const MAX_PATH_LEN = 1000

/**
 * Validate an absolute POSIX path. Rejects:
 *  - non-strings, empty, > MAX_PATH_LEN
 *  - relative paths
 *  - paths whose `posix.normalize` differs (catches `.` and `..` SEGMENTS)
 *
 * Crucially does NOT reject `..` as a substring — `foo..bar` is a valid
 * filename and must pass through. `posix.normalize('/home/u/foo..bar')`
 * is unchanged, so the equality check accepts it; `posix.normalize('/a/../b')`
 * collapses to `/b`, so the equality check rejects traversal.
 */
function validateAbsolutePath(p: unknown, label: string): string {
  if (typeof p !== 'string') throw new Error(`${label} expects a string`)
  if (p.length === 0 || p.length > MAX_PATH_LEN) throw new Error(`${label}: invalid path`)
  if (!p.startsWith('/')) throw new Error(`${label}: invalid path`)
  if (path.posix.normalize(p) !== p) throw new Error(`${label}: invalid path`)
  return p
}

/**
 * Enforce scope: requested path must be the project root or strictly inside
 * it. Without this, a compromised renderer could enumerate arbitrary WSL
 * directories. The `+ '/'` guard prevents `proj-evil` masquerading as `proj`.
 *
 * This is a LEXICAL check: symlinks inside the project that point outside
 * are followed by the underlying `readdir` / `shell.openPath` calls. That's
 * intentional and matches VSCode's File Explorer + JetBrains' Project view
 * (linked monorepo packages, vendored sources, etc.).
 */
function assertWithinProject(p: string, projectPath: string, label: string): void {
  if (p !== projectPath && !p.startsWith(projectPath + '/')) {
    throw new Error(`${label}: path must be within projectPath`)
  }
}

export interface ListDirIpcResult {
  entries: DirEntry[]
  gitignored: string[]
}

export function registerFilesIpc(): void {
  ipcMain.handle('files:listDir', async (_, opts: unknown): Promise<ListDirIpcResult> => {
    if (!opts || typeof opts !== 'object') {
      throw new Error('files:listDir expects an options object')
    }
    const { path: dirPath, projectPath } = opts as { path: unknown; projectPath: unknown }
    const validatedDir = validateAbsolutePath(dirPath, 'files:listDir')
    const validatedProj = validateAbsolutePath(projectPath, 'files:listDir.projectPath')
    assertWithinProject(validatedDir, validatedProj, 'files:listDir')

    log.debug('files:listDir', { dirPath: validatedDir })

    const result = await listDir(validatedDir)
    const names = result.entries.map((e) => e.name)
    const dirRel =
      validatedDir === validatedProj ? '' : validatedDir.slice(validatedProj.length + 1)
    const ignoredSet = await gitignoreCheck(validatedProj, dirRel, names)

    const filtered = result.entries.filter((e) => !ignoredSet.has(e.name))
    return { entries: filtered, gitignored: [...ignoredSet] }
  })

  ipcMain.handle('files:openExternal', async (_, opts: unknown): Promise<void> => {
    if (!opts || typeof opts !== 'object') {
      throw new Error('files:openExternal expects an options object')
    }
    const { path: filePath, projectPath } = opts as { path: unknown; projectPath: unknown }
    const validated = validateAbsolutePath(filePath, 'files:openExternal')
    const validatedProj = validateAbsolutePath(projectPath, 'files:openExternal.projectPath')
    assertWithinProject(validated, validatedProj, 'files:openExternal')

    const distro = await getDefaultDistroAsync()
    const winPath = validated.startsWith('/') ? wslPathToWindows(validated, distro) : validated
    log.debug('files:openExternal', { winPath })
    const err = await shell.openPath(winPath)
    if (err) throw new Error(`shell.openPath failed: ${err}`)
  })
}
