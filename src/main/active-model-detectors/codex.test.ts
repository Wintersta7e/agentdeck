import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./_shared', () => ({
  readWslEnv: vi.fn(),
  readWslFile: vi.fn(),
  resolveWslPath: vi.fn(),
}))

import { readWslEnv, readWslFile, resolveWslPath } from './_shared'
import { readCodexActiveModel } from './codex'

const mEnv = readWslEnv as ReturnType<typeof vi.fn>
const mFile = readWslFile as ReturnType<typeof vi.fn>
const mPath = resolveWslPath as ReturnType<typeof vi.fn>

describe('readCodexActiveModel', () => {
  beforeEach(() => {
    mEnv.mockReset()
    mFile.mockReset()
    mPath.mockReset()
  })

  it('reads model from $CODEX_HOME/config.toml', async () => {
    mEnv.mockResolvedValue('/home/u/.codex')
    mPath.mockResolvedValue('/home/u/.codex/config.toml')
    mFile.mockResolvedValue('model = "gpt-5.4"\nmodel_provider = "openai"\n')
    await expect(readCodexActiveModel()).resolves.toEqual({ modelId: 'gpt-5.4' })
  })

  it('captures model_context_window', async () => {
    mEnv.mockResolvedValue(null)
    mPath.mockResolvedValue('/home/u/.codex/config.toml')
    mFile.mockResolvedValue('model = "gpt-5.4"\nmodel_context_window = 1050000\n')
    await expect(readCodexActiveModel()).resolves.toEqual({
      modelId: 'gpt-5.4',
      cliContextOverride: 1_050_000,
    })
  })

  it('returns {modelId: null} on missing file', async () => {
    mEnv.mockResolvedValue(null)
    mPath.mockResolvedValue('/home/u/.codex/config.toml')
    mFile.mockResolvedValue(null)
    await expect(readCodexActiveModel()).resolves.toEqual({ modelId: null })
  })

  it('returns {modelId: null} on malformed TOML', async () => {
    mEnv.mockResolvedValue(null)
    mPath.mockResolvedValue('/home/u/.codex/config.toml')
    mFile.mockResolvedValue('model = "foo\nbroken')
    await expect(readCodexActiveModel()).resolves.toEqual({ modelId: null })
  })
})
