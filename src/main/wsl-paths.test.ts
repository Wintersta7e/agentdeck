import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({ execFile: vi.fn() }))
vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }))

vi.mock('./wsl-utils', () => ({
  getDefaultDistroAsync: vi.fn().mockResolvedValue('Ubuntu'),
  wslPathToWindows: vi.fn((p: string, distro?: string) => {
    if (p.startsWith('/mnt/'))
      return p.replace(/^\/mnt\/([a-z])\//, (_, d) => `${d.toUpperCase()}:\\`).replace(/\//g, '\\')
    return `\\\\wsl.localhost\\${distro ?? 'Ubuntu'}${p.replace(/\//g, '\\')}`
  }),
  withUncFallback: vi.fn(async (p: string, op: (x: string) => Promise<unknown>) => op(p)),
  NODE_INIT: '',
}))

vi.mock('./logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import {
  getWslHome,
  getClaudeConfigDir,
  getCodexHome,
  readWslFileSafe,
  invalidateWslPathsCache,
} from './wsl-paths'

describe('wsl-paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateWslPathsCache()
  })

  function mockWslExec(stdout: string): void {
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (e: Error | null, out: string, err: string) => void,
    ) => {
      cb(null, stdout, '')
      return {} as never
    }) as never)
  }

  it('getWslHome resolves $HOME via wsl.exe and caches per distro', async () => {
    mockWslExec('/home/u\n')
    const a = await getWslHome()
    const b = await getWslHome()
    expect(a).toBe('/home/u')
    expect(b).toBe('/home/u')
    expect(execFile).toHaveBeenCalledTimes(1)
  })

  it('getWslHome returns null when wsl.exe fails', async () => {
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (e: Error | null) => void,
    ) => {
      cb(new Error('boom'))
      return {} as never
    }) as never)
    const home = await getWslHome()
    expect(home).toBeNull()
  })

  it('getClaudeConfigDir honors $CLAUDE_CONFIG_DIR if set', async () => {
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      args: string[],
      _opts: unknown,
      cb: (e: Error | null, out: string, err: string) => void,
    ) => {
      const inner = args[args.length - 1] ?? ''
      if (inner.includes('CLAUDE_CONFIG_DIR')) cb(null, '/custom/claude\n', '')
      else if (inner.includes('HOME')) cb(null, '/home/u\n', '')
      else cb(null, '', '')
      return {} as never
    }) as never)

    const dir = await getClaudeConfigDir()
    expect(dir).toBe('/custom/claude')
  })

  it('getClaudeConfigDir falls back to $HOME/.claude when env var unset', async () => {
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      args: string[],
      _opts: unknown,
      cb: (e: Error | null, out: string, err: string) => void,
    ) => {
      const inner = args[args.length - 1] ?? ''
      if (inner.includes('CLAUDE_CONFIG_DIR')) cb(null, '\n', '')
      else if (inner.includes('HOME')) cb(null, '/home/u\n', '')
      else cb(null, '', '')
      return {} as never
    }) as never)

    const dir = await getClaudeConfigDir()
    expect(dir).toBe('/home/u/.claude')
  })

  it('getCodexHome honors $CODEX_HOME if set', async () => {
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      args: string[],
      _opts: unknown,
      cb: (e: Error | null, out: string, err: string) => void,
    ) => {
      const inner = args[args.length - 1] ?? ''
      if (inner.includes('CODEX_HOME')) cb(null, '/opt/codex\n', '')
      else if (inner.includes('HOME')) cb(null, '/home/u\n', '')
      else cb(null, '', '')
      return {} as never
    }) as never)

    expect(await getCodexHome()).toBe('/opt/codex')
  })

  it('readWslFileSafe converts WSL path to UNC and reads via withUncFallback', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('hello world')
    const { wslPathToWindows, withUncFallback } = await import('./wsl-utils')
    const text = await readWslFileSafe('/home/u/.claude/settings.json')
    expect(text).toBe('hello world')
    expect(wslPathToWindows).toHaveBeenCalledWith('/home/u/.claude/settings.json', 'Ubuntu')
    expect(withUncFallback).toHaveBeenCalled()
    const calls = vi.mocked(readFile).mock.calls
    expect(calls[0]?.[0]).toBe('\\\\wsl.localhost\\Ubuntu\\home\\u\\.claude\\settings.json')
    expect(calls[0]?.[1]).toBe('utf-8')
  })

  it('readWslFileSafe handles /mnt/c/ paths (Windows drive form)', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('text')
    const text = await readWslFileSafe('/mnt/c/Users/u/file.txt')
    expect(text).toBe('text')
    const calls = vi.mocked(readFile).mock.calls
    expect(calls[0]?.[0]).toBe('C:\\Users\\u\\file.txt')
  })

  it('readWslFileSafe returns null on read failure', async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'))
    const text = await readWslFileSafe('/home/u/missing.txt')
    expect(text).toBeNull()
  })
})
