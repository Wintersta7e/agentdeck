import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('./wsl-utils', () => ({
  NODE_INIT: 'export NVM_DIR="$HOME/.nvm"; ',
}))

import { shellQuote, wslRun, wslTry } from './wsl-exec'
import { execFile } from 'child_process'

const mockedExecFile = vi.mocked(execFile)

type ExecFileCb = (err: NodeJS.ErrnoException | null, stdout: string, stderr: string) => void

/** Replace the execFile mock so the next call invokes its callback with the given result. */
function respond(stdout: string, stderr = '', err: NodeJS.ErrnoException | null = null): void {
  mockedExecFile.mockImplementationOnce(((
    _file: string,
    _args: string[],
    _opts: Record<string, unknown>,
    cb: ExecFileCb,
  ) => {
    cb(err, stdout, stderr)
    return {} as never
  }) as never)
}

function captureExecFileCall(): {
  cmd: string
  args: string[]
  opts: Record<string, unknown>
} {
  const call = mockedExecFile.mock.calls[0]
  if (!call) throw new Error('execFile was never invoked')
  const [cmd, args, opts] = call as unknown as [string, string[], Record<string, unknown>]
  return { cmd, args, opts }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('shellQuote', () => {
  it('wraps strings without single quotes in single quotes', () => {
    expect(shellQuote('hello world')).toBe("'hello world'")
  })

  it('escapes embedded single quotes by closing-escaping-reopening', () => {
    expect(shellQuote("it's fine")).toBe("'it'\\''s fine'")
  })

  it('handles strings with only a single quote', () => {
    expect(shellQuote("'")).toBe("''\\'''")
  })

  it('leaves shell metacharacters intact (they are inside the literal string)', () => {
    // The whole point: $VAR, `cmd`, ;, &, |, etc. become literal inside single quotes.
    expect(shellQuote('$HOME && rm -rf /')).toBe("'$HOME && rm -rf /'")
  })

  it('quotes the empty string', () => {
    expect(shellQuote('')).toBe("''")
  })
})

describe('wslRun', () => {
  it('invokes wsl.exe with default distro and bash -lc wrapper', async () => {
    respond('ok\n')
    const out = await wslRun('echo ok')

    expect(out).toBe('ok\n')
    const call = captureExecFileCall()
    expect(call.cmd).toBe('wsl.exe')
    expect(call.args).toEqual(['--', 'bash', '-lc', 'echo ok'])
  })

  it('passes -d <distro> when a distro is provided', async () => {
    respond('x')
    await wslRun('ls', { distro: 'Debian' })

    expect(captureExecFileCall().args).toEqual(['-d', 'Debian', '--', 'bash', '-lc', 'ls'])
  })

  it('prepends NODE_INIT when prefixNodeInit is true', async () => {
    respond('20.0.0')
    await wslRun('node -v', { prefixNodeInit: true })

    expect(captureExecFileCall().args[3]).toMatch(/^export NVM_DIR.*node -v$/)
  })

  it('uses the configured timeout, defaulting to 15000ms', async () => {
    respond('')
    await wslRun('a')
    expect(captureExecFileCall().opts.timeout).toBe(15_000)

    mockedExecFile.mockClear()
    respond('')
    await wslRun('b', { timeout: 500 })
    expect(captureExecFileCall().opts.timeout).toBe(500)
  })

  it('rejects with stderr text when the command fails', async () => {
    respond('', 'permission denied\n', new Error('exit code 1') as NodeJS.ErrnoException)
    await expect(wslRun('do thing')).rejects.toThrow('permission denied')
  })

  it('falls back to the error message when stderr is empty', async () => {
    respond('', '', new Error('spawn ENOENT') as NodeJS.ErrnoException)
    await expect(wslRun('x')).rejects.toThrow('spawn ENOENT')
  })

  it('returns stdout instead of throwing when fallbackStderrAsOutput is set and stdout was produced', async () => {
    respond('1.2.3\n', 'warning: blah', new Error('exit 1') as NodeJS.ErrnoException)
    await expect(wslRun('npm -v', { fallbackStderrAsOutput: true })).resolves.toBe('1.2.3')
  })

  it('still rejects when fallbackStderrAsOutput is set but stdout is empty', async () => {
    respond('', 'real failure', new Error('exit 2') as NodeJS.ErrnoException)
    await expect(wslRun('x', { fallbackStderrAsOutput: true })).rejects.toThrow('real failure')
  })
})

describe('wslTry', () => {
  it('resolves to stdout on success', async () => {
    respond('value\n')
    await expect(wslTry('cat /file')).resolves.toBe('value\n')
  })

  it('resolves to null on failure (default silent log)', async () => {
    respond('', 'ENOENT', new Error('no such file') as NodeJS.ErrnoException)
    await expect(wslTry('cat /missing')).resolves.toBeNull()
  })

  it('passes -d <distro> when provided', async () => {
    respond('')
    await wslTry('ls', { distro: 'Ubuntu-22.04' })

    expect(captureExecFileCall().args).toEqual(['-d', 'Ubuntu-22.04', '--', 'bash', '-lc', 'ls'])
  })

  it('uses utf-8 encoding by default', async () => {
    respond('')
    await wslTry('echo')
    expect(captureExecFileCall().opts.encoding).toBe('utf-8')
  })
})
