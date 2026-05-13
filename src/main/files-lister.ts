import { readdir } from 'node:fs/promises'
import { wslPathToWindows, withUncFallback, getDefaultDistroAsync } from './wsl-utils'

export interface DirEntry {
  name: string
  isDir: boolean
}

export interface ListDirResult {
  entries: DirEntry[]
}

/**
 * List a directory by absolute path.
 *
 * Accepts WSL paths (e.g. `/home/u/proj`, `/mnt/c/...`) and Windows paths.
 * For non-`/mnt/` WSL paths we route through `\\wsl.localhost\<distro>\...`
 * with a `\\wsl$\` fallback for older Windows builds. Sort: folders first,
 * then files; case-insensitive alpha.
 */
export async function listDir(absolutePath: string): Promise<ListDirResult> {
  const distro = await getDefaultDistroAsync()
  const winPath = absolutePath.startsWith('/')
    ? wslPathToWindows(absolutePath, distro)
    : absolutePath

  const dirents = await withUncFallback(winPath, (p) => readdir(p, { withFileTypes: true }))

  const out: DirEntry[] = dirents.map((d) => ({ name: d.name, isDir: d.isDirectory() }))
  out.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })

  return { entries: out }
}
