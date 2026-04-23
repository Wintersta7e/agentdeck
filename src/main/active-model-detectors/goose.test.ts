import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./_shared', () => ({
  readWslEnv: vi.fn(),
  readWslFile: vi.fn(),
  resolveWslPath: vi.fn(),
}))

import { readWslEnv, readWslFile, resolveWslPath } from './_shared'
import { readGooseActiveModel } from './goose'

const mEnv = readWslEnv as ReturnType<typeof vi.fn>
const mFile = readWslFile as ReturnType<typeof vi.fn>
const mPath = resolveWslPath as ReturnType<typeof vi.fn>

describe('readGooseActiveModel', () => {
  beforeEach(() => {
    mEnv.mockReset()
    mFile.mockReset()
    mPath.mockReset()
  })

  it('env GOOSE_MODEL overrides config', async () => {
    // First call: GOOSE_MODEL; second (if needed): GOOSE_CONFIG_DIR
    mEnv.mockResolvedValueOnce('gpt-5.4').mockResolvedValueOnce(null)
    mPath.mockResolvedValue('/home/u/.config/goose/config.yaml')
    mFile.mockResolvedValue('GOOSE_MODEL: claude-opus-4-7\n')
    await expect(readGooseActiveModel()).resolves.toEqual({ modelId: 'gpt-5.4' })
  })

  it('reads flat GOOSE_MODEL key from file when env unset', async () => {
    mEnv.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    mPath.mockResolvedValue('/home/u/.config/goose/config.yaml')
    mFile.mockResolvedValue('GOOSE_MODEL: claude-opus-4-7\nGOOSE_PROVIDER: anthropic\n')
    await expect(readGooseActiveModel()).resolves.toEqual({ modelId: 'claude-opus-4-7' })
  })

  it('returns {modelId: null} on missing file and no env', async () => {
    mEnv.mockResolvedValue(null)
    mPath.mockResolvedValue('/home/u/.config/goose/config.yaml')
    mFile.mockResolvedValue(null)
    await expect(readGooseActiveModel()).resolves.toEqual({ modelId: null })
  })
})
