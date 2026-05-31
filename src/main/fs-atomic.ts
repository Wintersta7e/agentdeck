import { promises as fs, writeFileSync, renameSync, statSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

/**
 * Atomically write `data` to `path` via a randomised tmp file + rename.
 * Returns the post-rename `mtimeMs` so callers that need it can avoid a
 * second `stat` round-trip.
 */
export async function atomicWrite(path: string, data: string): Promise<number> {
  const tmp = `${path}.${randomBytes(6).toString('hex')}.tmp`
  await fs.writeFile(tmp, data, 'utf-8')
  await fs.rename(tmp, path)
  const s = await fs.stat(path)
  return s.mtimeMs
}

/**
 * Synchronous version for `before-quit` paths that cannot await.
 */
export function atomicWriteSync(path: string, data: string): number {
  const tmp = `${path}.${randomBytes(6).toString('hex')}.tmp`
  writeFileSync(tmp, data, 'utf-8')
  renameSync(tmp, path)
  return statSync(path).mtimeMs
}
