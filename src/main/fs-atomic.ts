import { promises as fs } from 'node:fs'
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
