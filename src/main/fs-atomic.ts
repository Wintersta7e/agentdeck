import { promises as fs, writeFileSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

/**
 * Atomically write `data` to `path` via a randomised tmp file + rename.
 * Returns the post-rename `mtimeMs` so callers that need it can avoid a
 * second `stat` round-trip. On rename failure the tmp file is removed so a
 * repeatedly-failing write (read-only mount, locked target) can't accumulate
 * orphaned `<name>.<hex>.tmp` files.
 */
export async function atomicWrite(path: string, data: string): Promise<number> {
  const tmp = `${path}.${randomBytes(6).toString('hex')}.tmp`
  await fs.writeFile(tmp, data, 'utf-8')
  try {
    await fs.rename(tmp, path)
  } catch (err) {
    await fs.unlink(tmp).catch(() => undefined)
    throw err
  }
  const s = await fs.stat(path)
  return s.mtimeMs
}

/**
 * Synchronous version for `before-quit` paths that cannot await.
 */
export function atomicWriteSync(path: string, data: string): number {
  const tmp = `${path}.${randomBytes(6).toString('hex')}.tmp`
  writeFileSync(tmp, data, 'utf-8')
  try {
    renameSync(tmp, path)
  } catch (err) {
    try {
      unlinkSync(tmp)
    } catch {
      // tmp already gone — nothing to clean up
    }
    throw err
  }
  return statSync(path).mtimeMs
}
