import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('./wsl-utils', () => ({
  getDefaultDistroAsync: vi.fn().mockResolvedValue('Ubuntu'),
  NODE_INIT: '',
}))

vi.mock('./logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import { execFile } from 'node:child_process'
import { gitignoreCheck } from './files-gitignore'

describe('files-gitignore.gitignoreCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the set of names git reports as ignored', async () => {
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (e: Error | null, out: string, err: string) => void,
    ) => {
      const child = {
        stdin: {
          write: () => {},
          end: () => {
            cb(null, 'node_modules\ndist\n', '')
          },
        },
      }
      return child as never
    }) as never)

    const ignored = await gitignoreCheck('/home/u/proj', '', [
      'src',
      'node_modules',
      'dist',
      'README.md',
    ])
    expect(ignored).toEqual(new Set(['node_modules', 'dist']))
  })

  it('returns empty set when git exits non-zero (treats as no ignores)', async () => {
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (e: Error | null, out: string, err: string) => void,
    ) => {
      const err = new Error('not a git repo') as NodeJS.ErrnoException
      err.code = 'EFAIL'
      const child = {
        stdin: {
          write: () => {},
          end: () => {
            cb(err, '', 'fatal: not a git repository')
          },
        },
      }
      return child as never
    }) as never)

    const ignored = await gitignoreCheck('/home/u/not-git', '', ['anything'])
    expect(ignored).toEqual(new Set())
  })

  it('returns empty set on empty input list without spawning git', async () => {
    const ignored = await gitignoreCheck('/home/u/proj', '', [])
    expect(ignored).toEqual(new Set())
    expect(execFile).not.toHaveBeenCalled()
  })

  it('joins dirRelPath with each name when piping to git', async () => {
    let stdinSent = ''
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (e: Error | null, out: string, err: string) => void,
    ) => {
      const child = {
        stdin: {
          write: (s: string) => {
            stdinSent += s
          },
          end: () => {
            cb(null, '', '')
          },
        },
      }
      return child as never
    }) as never)

    await gitignoreCheck('/home/u/proj', 'src/components', ['Foo.tsx', 'bar.css'])
    expect(stdinSent).toContain('src/components/Foo.tsx')
    expect(stdinSent).toContain('src/components/bar.css')
  })
})
