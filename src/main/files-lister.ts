import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { wslPathToWindows, withUncFallback, getDefaultDistroAsync } from './wsl-utils'

export interface DirEntry {
  name: string
  isDir: boolean
  size?: number
  mtime?: number
}

export interface ListDirResult {
  entries: DirEntry[]
}

const STAT_CONCURRENCY = 16

/**
 * List a directory by absolute path.
 *
 * Accepts WSL paths (e.g. `/home/u/proj`, `/mnt/c/...`) and Windows paths.
 * For non-`/mnt/` WSL paths we route through `\\wsl.localhost\<distro>\...`
 * with a `\\wsl$\` fallback for older Windows builds. Sort: folders first,
 * then files; case-insensitive alpha. File `stat` runs in bounded parallel
 * batches (16 at a time) so directories with hundreds of entries don't
 * serialize on disk roundtrips.
 */
export async function listDir(absolutePath: string): Promise<ListDirResult> {
  const distro = await getDefaultDistroAsync()
  const winPath = absolutePath.startsWith('/')
    ? wslPathToWindows(absolutePath, distro)
    : absolutePath

  const dirents = await withUncFallback(winPath, (p) => readdir(p, { withFileTypes: true }))

  const out: DirEntry[] = dirents.map((d) => ({ name: d.name, isDir: d.isDirectory() }))

  const fileIndices = out.map((e, i) => (e.isDir ? -1 : i)).filter((i) => i !== -1)
  for (let i = 0; i < fileIndices.length; i += STAT_CONCURRENCY) {
    const batch = fileIndices.slice(i, i + STAT_CONCURRENCY)
    await Promise.all(
      batch.map(async (idx) => {
        const entry = out[idx]
        if (!entry) return
        try {
          const st = await withUncFallback(path.join(winPath, entry.name), (p) => stat(p))
          entry.size = st.size
          entry.mtime = st.mtimeMs
        } catch {
          // best-effort — leave size/mtime undefined
        }
      }),
    )
  }

  out.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })

  return { entries: out }
}
