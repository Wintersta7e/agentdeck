import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock child_process before importing module under test
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

import { wslPathToWindows } from './wsl-utils'
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
})
