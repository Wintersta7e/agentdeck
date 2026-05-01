import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

// Tests run under Linux (WSL); the production wslPathToWindows would
// produce a UNC path that only resolves from Windows. Mock to identity so
// the temp-dir fixtures created with real fs are reachable. This mirrors
// the pattern used in detect-stack.test.ts.
vi.mock('./wsl-utils', () => ({
  wslPathToWindows: (p: string) => p,
  withUncFallback: async (p: string, op: (path: string) => Promise<unknown>) => op(p),
  getDefaultDistroAsync: () => Promise.resolve('Ubuntu'),
}))

import { listDir } from './files-lister'

describe('files-lister.listDir', () => {
  let tmp: string

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'agentdeck-files-'))
    await writeFile(path.join(tmp, 'a.txt'), 'hi')
    await writeFile(path.join(tmp, 'b.json'), '{}')
    await writeFile(path.join(tmp, 'foo..bar'), 'x')
    await mkdir(path.join(tmp, 'sub'))
    await writeFile(path.join(tmp, 'sub', 'nested.md'), '# x')
  })

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  it('lists files and dirs sorted folders-first, case-insensitive alphabetical', async () => {
    const result = await listDir(tmp)
    expect(result.entries.map((e) => e.name)).toEqual(['sub', 'a.txt', 'b.json', 'foo..bar'])
    expect(result.entries[0]?.isDir).toBe(true)
    expect(result.entries[1]?.isDir).toBe(false)
  })

  it('throws ENOENT-like error on missing dir', async () => {
    await expect(listDir(path.join(tmp, 'does-not-exist'))).rejects.toThrow()
  })
})
