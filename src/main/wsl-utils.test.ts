import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock child_process before importing module under test
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

import { wslPathToWindows, toWslPath } from './wsl-utils'
import { execFile } from 'child_process'

const mockedExecFile = vi.mocked(execFile)

beforeEach(() => {
  vi.clearAllMocks()
  // Reset the cached distro between tests by re-importing
  // The module caches the result, so we need to reset it
})

describe('wslPathToWindows', () => {
  it('converts /mnt/c/ paths to C:\\ drive paths', () => {
    expect(wslPathToWindows('/mnt/c/Users/test')).toBe('C:\\Users\\test')
  })

  it('converts /mnt/d/ paths to D:\\ drive paths', () => {
    expect(wslPathToWindows('/mnt/d/projects/foo')).toBe('D:\\projects\\foo')
  })

  it('uppercases drive letter', () => {
    expect(wslPathToWindows('/mnt/e/data')).toBe('E:\\data')
  })

  it('converts /home/ paths to UNC paths with default distro', () => {
    expect(wslPathToWindows('/home/user/project')).toBe(
      '\\\\wsl.localhost\\Ubuntu\\home\\user\\project',
    )
  })

  it('converts /home/ paths with custom distro', () => {
    expect(wslPathToWindows('/home/user/code', 'Debian')).toBe(
      '\\\\wsl.localhost\\Debian\\home\\user\\code',
    )
  })

  it('rejects invalid distro names', () => {
    expect(() => wslPathToWindows('/home/user', '../evil')).toThrow('Invalid WSL distro')
  })

  it('handles /mnt/c/ root path', () => {
    expect(wslPathToWindows('/mnt/c/')).toBe('C:\\')
  })

  it('converts forward slashes to backslashes in rest of path', () => {
    expect(wslPathToWindows('/mnt/c/a/b/c/d.txt')).toBe('C:\\a\\b\\c\\d.txt')
  })
})

describe('getDefaultDistroAsync', () => {
  it('parses wsl.exe output for first distro name', async () => {
    vi.resetModules()
    mockedExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        ;(cb as (err: null, stdout: string) => void)(null, 'Ubuntu-24.04\n')
        return undefined as never
      },
    )
    const { getDefaultDistroAsync: freshGet } = await import('./wsl-utils')
    const result = await freshGet()
    expect(result).toBe('Ubuntu-24.04')
  })

  it('falls back to "Ubuntu" on error', async () => {
    vi.resetModules()
    mockedExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        ;(cb as (err: Error) => void)(new Error('wsl.exe not found'))
        return undefined as never
      },
    )
    const { getDefaultDistroAsync: freshGet } = await import('./wsl-utils')
    const result = await freshGet()
    expect(result).toBe('Ubuntu')
  })

  it('falls back to "Ubuntu" when wsl.exe exits 0 with empty/BOM-only output', async () => {
    // WSL installed but no distros registered: exit 0, stdout is just a BOM and
    // whitespace. Must cache the fallback, not an empty distro segment.
    vi.resetModules()
    mockedExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        ;(cb as (err: null, stdout: string) => void)(null, '﻿\n   \n')
        return undefined as never
      },
    )
    const { getDefaultDistroAsync: freshGet } = await import('./wsl-utils')
    expect(await freshGet()).toBe('Ubuntu')
  })
})

describe('resolveWslUsername', () => {
  it('returns the first non-empty result across the racing commands', async () => {
    vi.resetModules()
    mockedExecFile.mockImplementation(
      (_cmd: unknown, args: unknown, _opts: unknown, cb: unknown) => {
        // Only the bare `wsl -- whoami` command yields a name; the bash variants
        // return empty. The non-empty one must win regardless of race order.
        const out = (args as string[]).join(' ') === '-- whoami' ? 'devuser\n' : ''
        ;(cb as (err: null, stdout: string) => void)(null, out)
        return undefined as never
      },
    )
    const { resolveWslUsername } = await import('./wsl-utils')
    expect(await resolveWslUsername()).toBe('devuser')
  })

  it('returns an empty string when every detection command fails or is empty', async () => {
    vi.resetModules()
    mockedExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        ;(cb as (err: Error, stdout: string) => void)(new Error('no wsl'), '')
        return undefined as never
      },
    )
    const { resolveWslUsername } = await import('./wsl-utils')
    expect(await resolveWslUsername()).toBe('')
  })
})

describe('toWslPath', () => {
  it('converts Windows drive paths to /mnt (drive letter lowercased)', () => {
    expect(toWslPath('C:\\Users\\test')).toBe('/mnt/c/Users/test')
    expect(toWslPath('c:\\Users\\test')).toBe('/mnt/c/Users/test')
  })

  it('preserves spaces in paths', () => {
    expect(toWslPath('C:\\Users\\my project')).toBe('/mnt/c/Users/my project')
  })

  it('handles a bare drive root', () => {
    expect(toWslPath('C:\\')).toBe('/mnt/c')
  })

  it('converts legacy and modern UNC WSL paths', () => {
    expect(toWslPath('\\\\wsl$\\Ubuntu\\home\\user')).toBe('/home/user')
    expect(toWslPath('\\\\wsl.localhost\\Ubuntu\\home\\user')).toBe('/home/user')
  })

  it('passes through paths that are already WSL', () => {
    expect(toWslPath('/home/user/project')).toBe('/home/user/project')
  })

  it('passes tilde home paths through verbatim (pty-manager cd relies on this)', () => {
    expect(toWslPath('~')).toBe('~')
    expect(toWslPath('~/code/app')).toBe('~/code/app')
  })

  it('returns an empty string unchanged', () => {
    expect(toWslPath('')).toBe('')
  })
})
