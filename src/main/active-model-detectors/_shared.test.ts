import { describe, expect, it, vi, beforeEach } from 'vitest'
import { promisify } from 'node:util'

let nextStub: { stdout: string; err: Error | undefined } | null = null

vi.mock('node:child_process', () => {
  const mockFn = vi.fn((_cmd, _args, _opts, cb) => {
    if (nextStub) {
      const stub = nextStub
      nextStub = null
      if (stub.err !== undefined) {
        return setImmediate(() => cb(stub.err))
      }
      return setImmediate(() => cb(null, stub.stdout, ''))
    }
    return setImmediate(() => cb(new Error('No stub configured')))
  })

  // Add custom promisify handler to match execFile behavior
  const customPromisifySymbol = promisify.custom as unknown as string | symbol
  ;(
    mockFn as unknown as {
      [K in string | symbol]: (
        cmd: string,
        args: string[],
        opts: unknown,
      ) => Promise<{ stdout: string; stderr: string }>
    }
  )[customPromisifySymbol] = (cmd: string, args: string[], opts: unknown) => {
    return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      mockFn(cmd, args, opts, (err: Error | null, stdout: string, stderr: string) => {
        if (err) reject(err)
        else resolve({ stdout, stderr })
      })
    })
  }

  return {
    execFile: mockFn,
  }
})

import { readWslFile, readWslEnv, resolveWslPath } from './_shared'

describe('shared WSL primitives', () => {
  beforeEach(() => {
    nextStub = null
  })

  function stubOnce(stdout: string, err: Error | undefined = undefined) {
    nextStub = { stdout, err }
  }

  it('readWslFile returns stdout on success', async () => {
    stubOnce('hello\n')
    await expect(readWslFile('/home/u/x')).resolves.toBe('hello\n')
  })

  it('readWslFile returns null on error', async () => {
    stubOnce('', new Error('no such file'))
    await expect(readWslFile('/nope')).resolves.toBeNull()
  })

  it('readWslEnv trims value', async () => {
    stubOnce('/home/u/.claude-alt\n')
    await expect(readWslEnv('CLAUDE_CONFIG_DIR')).resolves.toBe('/home/u/.claude-alt')
  })

  it('readWslEnv returns null on empty stdout', async () => {
    stubOnce('')
    await expect(readWslEnv('MISSING')).resolves.toBeNull()
  })

  it('resolveWslPath runs shell expansion', async () => {
    stubOnce('/home/u/.claude/settings.json')
    await expect(resolveWslPath('$HOME/.claude/settings.json')).resolves.toBe(
      '/home/u/.claude/settings.json',
    )
  })
})
