import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
}))

// Mock wsl-utils to avoid execFileSync in module-level init
vi.mock('./wsl-utils', () => ({
  wslPathToWindows: vi.fn((p: string, _distro?: string) => {
    // Simulate the real conversion for test control
    const match = p.match(/^\/mnt\/([a-zA-Z])\/(.*)$/)
    if (match?.[1] && match[2] !== undefined) {
      return `${match[1].toUpperCase()}:\\${match[2].replace(/\//g, '\\')}`
    }
    return `\\\\wsl.localhost\\Ubuntu${p.replace(/\//g, '\\')}`
  }),
}))

import { detectStack } from './detect-stack'
import { readdir } from 'fs/promises'

const mockedReaddir = vi.mocked(readdir)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('detectStack', () => {
  it('detects Python from pyproject.toml', async () => {
    mockedReaddir.mockResolvedValue(['pyproject.toml', 'README.md'] as never)
    const result = await detectStack('/mnt/c/project', 'Ubuntu')
    expect(result).not.toBeNull()
    expect(result?.badge).toBe('Python')
    expect(result?.items.some((i) => i.label === 'Python')).toBe(true)
  })

  it('detects TypeScript (JS upgraded to TS when tsconfig present)', async () => {
    mockedReaddir.mockResolvedValue(['package.json', 'tsconfig.json'] as never)
    const result = await detectStack('/mnt/c/project', 'Ubuntu')
    expect(result?.badge).toBe('TS')
    expect(result?.items.some((i) => i.label === 'TypeScript')).toBe(true)
  })

  it('detects JavaScript without tsconfig', async () => {
    mockedReaddir.mockResolvedValue(['package.json'] as never)
    const result = await detectStack('/mnt/c/project', 'Ubuntu')
    expect(result?.badge).toBe('JS')
  })

  it('detects Rust from Cargo.toml', async () => {
    mockedReaddir.mockResolvedValue(['Cargo.toml', 'src'] as never)
    const result = await detectStack('/mnt/c/project', 'Ubuntu')
    expect(result?.badge).toBe('Rust')
  })

  it('detects .NET from .sln file', async () => {
    mockedReaddir.mockResolvedValue(['MyApp.sln'] as never)
    const result = await detectStack('/mnt/c/project', 'Ubuntu')
    expect(result?.badge).toBe('.NET')
  })

  it('returns null on ENOENT', async () => {
    const err = new Error('not found') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    mockedReaddir.mockRejectedValue(err)
    const result = await detectStack('/mnt/c/nonexistent', 'Ubuntu')
    expect(result).toBeNull()
  })

  it('includes context files when present', async () => {
    mockedReaddir.mockResolvedValue(['package.json', 'CLAUDE.md', 'AGENTS.md'] as never)
    const result = await detectStack('/mnt/c/project', 'Ubuntu')
    expect(result?.contextFiles).toContain('CLAUDE.md')
    expect(result?.contextFiles).toContain('AGENTS.md')
  })

  it('tries wsl$ fallback when wsl.localhost fails', async () => {
    // First call (wsl.localhost) fails, second call (wsl$) succeeds
    mockedReaddir
      .mockRejectedValueOnce(new Error('network path not found'))
      .mockResolvedValueOnce(['package.json'] as never)

    const result = await detectStack('/home/user/project', 'Ubuntu')
    expect(result).not.toBeNull()
    expect(result?.badge).toBe('JS')
    // Should have been called twice
    expect(mockedReaddir).toHaveBeenCalledTimes(2)
  })

  it('accepts Windows paths directly', async () => {
    mockedReaddir.mockResolvedValue(['Cargo.toml'] as never)
    const result = await detectStack('C:\\Users\\dev\\project', 'Ubuntu')
    expect(result?.badge).toBe('Rust')
    // Should call readdir with the Windows path directly
    expect(mockedReaddir).toHaveBeenCalledWith('C:\\Users\\dev\\project')
  })

  it('detects Go from go.mod', async () => {
    mockedReaddir.mockResolvedValue(['go.mod', 'main.go'] as never)
    const result = await detectStack('/mnt/c/project', 'Ubuntu')
    expect(result?.badge).toBe('Go')
  })
})
