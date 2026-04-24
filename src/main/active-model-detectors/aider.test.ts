import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./_shared', () => ({
  readWslEnv: vi.fn(),
  readWslFile: vi.fn(),
  resolveWslPath: vi.fn(),
}))

import { readWslEnv, readWslFile, resolveWslPath } from './_shared'
import { readAiderActiveModel } from './aider'

const mEnv = readWslEnv as ReturnType<typeof vi.fn>
const mFile = readWslFile as ReturnType<typeof vi.fn>
const mPath = resolveWslPath as ReturnType<typeof vi.fn>

describe('readAiderActiveModel', () => {
  beforeEach(() => {
    mEnv.mockReset()
    mFile.mockReset()
    mPath.mockReset()
  })

  it('env AIDER_MODEL overrides config file', async () => {
    mEnv.mockResolvedValue('claude-sonnet-4-6[1m]')
    mPath.mockResolvedValue('/home/u/.aider.conf.yml')
    mFile.mockResolvedValue('model: claude-opus-4-7\n')
    await expect(readAiderActiveModel()).resolves.toEqual({ modelId: 'claude-sonnet-4-6[1m]' })
  })

  it('reads from config file when env unset', async () => {
    mEnv.mockResolvedValue(null)
    mPath.mockResolvedValue('/home/u/.aider.conf.yml')
    mFile.mockResolvedValue('model: claude-opus-4-7\n')
    await expect(readAiderActiveModel()).resolves.toEqual({ modelId: 'claude-opus-4-7' })
  })

  it('returns {modelId: null} when neither set', async () => {
    mEnv.mockResolvedValue(null)
    mPath.mockResolvedValue('/home/u/.aider.conf.yml')
    mFile.mockResolvedValue(null)
    await expect(readAiderActiveModel()).resolves.toEqual({ modelId: null })
  })

  it('returns {modelId: null} on malformed YAML', async () => {
    mEnv.mockResolvedValue(null)
    mPath.mockResolvedValue('/home/u/.aider.conf.yml')
    mFile.mockResolvedValue('::: not yaml\n  - : :')
    await expect(readAiderActiveModel()).resolves.toEqual({ modelId: null })
  })
})
