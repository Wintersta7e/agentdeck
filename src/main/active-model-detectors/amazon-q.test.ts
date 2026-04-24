import { describe, expect, it, vi, beforeEach } from 'vitest'
import { promisify } from 'node:util'

let stubs: Array<{ stdout: string; err: Error | undefined }> = []

vi.mock('node:child_process', () => {
  const mockFn = vi.fn((_cmd, _args, _opts, cb) => {
    if (stubs.length > 0) {
      const stub = stubs.shift()!
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

import { readAmazonQActiveModel } from './amazon-q'

describe('readAmazonQActiveModel', () => {
  beforeEach(() => {
    stubs = []
  })

  function stubOnce(stdout: string, err: Error | undefined = undefined) {
    stubs.push({ stdout, err })
  }

  it('returns trimmed model id on successful read', async () => {
    stubOnce('claude-sonnet-4-5\n')
    await expect(readAmazonQActiveModel()).resolves.toEqual({ modelId: 'claude-sonnet-4-5' })
  })

  it('tries fallback syntax if first form fails', async () => {
    stubOnce('', new Error('unknown subcommand'))
    stubOnce('gpt-5.4\n')
    await expect(readAmazonQActiveModel()).resolves.toEqual({ modelId: 'gpt-5.4' })
  })

  it('returns null if q not installed (both forms fail)', async () => {
    stubOnce('', new Error('command not found'))
    stubOnce('', new Error('command not found'))
    await expect(readAmazonQActiveModel()).resolves.toEqual({ modelId: null })
  })

  it('returns null on empty stdout', async () => {
    stubOnce('')
    stubOnce('')
    await expect(readAmazonQActiveModel()).resolves.toEqual({ modelId: null })
  })
})
