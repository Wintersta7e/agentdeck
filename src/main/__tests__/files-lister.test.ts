import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

// Module-mock fs/promises so we can selectively make `stat` fail for one
// path while leaving the rest (mkdtemp, writeFile, etc.) backed by real
// fs. `vi.spyOn` does NOT work on ESM namespace exports — that's why we
// go through a hoisted vi.mock factory here.
let statFailSuffix: string | null = null

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return {
    ...actual,
    stat: async (p: Parameters<typeof actual.stat>[0]) => {
      if (
        statFailSuffix !== null &&
        typeof p === 'string' &&
        p.replace(/\\/g, '/').endsWith(statFailSuffix)
      ) {
        const err = new Error('mocked stat failure') as NodeJS.ErrnoException
        err.code = 'ENOENT'
        throw err
      }
      return actual.stat(p)
    },
  }
})

// Tests run under Linux (WSL); the production wslPathToWindows would
// produce a UNC path that only resolves from Windows. Mock to identity so
// the temp-dir fixtures created with real fs are reachable. This mirrors
// the pattern used in detect-stack.test.ts.
vi.mock('../wsl-utils', () => ({
  wslPathToWindows: (p: string) => p,
  withUncFallback: async (p: string, op: (path: string) => Promise<unknown>) => op(p),
  getDefaultDistroAsync: () => Promise.resolve('Ubuntu'),
}))

import { listDir } from '../files-lister'

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

  beforeEach(() => {
    statFailSuffix = null
  })

  it('lists files and dirs sorted folders-first, case-insensitive alphabetical', async () => {
    const result = await listDir(tmp)
    expect(result.entries.map((e) => e.name)).toEqual(['sub', 'a.txt', 'b.json', 'foo..bar'])
    expect(result.entries[0]?.isDir).toBe(true)
    expect(result.entries[1]?.isDir).toBe(false)
  })

  it('returns size and mtime for files', async () => {
    const result = await listDir(tmp)
    const a = result.entries.find((e) => e.name === 'a.txt')
    expect(a?.size).toBeGreaterThan(0)
    expect(typeof a?.mtime).toBe('number')
  })

  it('throws ENOENT-like error on missing dir', async () => {
    await expect(listDir(path.join(tmp, 'does-not-exist'))).rejects.toThrow()
  })

  it('leaves size and mtime undefined when stat fails (best-effort)', async () => {
    statFailSuffix = '/a.txt'
    const result = await listDir(tmp)
    const a = result.entries.find((e) => e.name === 'a.txt')
    expect(a).toBeDefined()
    expect(a?.size).toBeUndefined()
    expect(a?.mtime).toBeUndefined()
    // Sibling files unaffected — real fs.stat still served them.
    const b = result.entries.find((e) => e.name === 'b.json')
    expect(b?.size).toBeGreaterThan(0)
    expect(typeof b?.mtime).toBe('number')
  })
})
