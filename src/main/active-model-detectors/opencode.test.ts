import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./_shared', () => ({
  readWslEnv: vi.fn(),
  readWslFile: vi.fn(),
  resolveWslPath: vi.fn(),
}))

import { readWslEnv, readWslFile, resolveWslPath } from './_shared'
import { readOpenCodeActiveModel } from './opencode'

const mEnv = readWslEnv as ReturnType<typeof vi.fn>
const mFile = readWslFile as ReturnType<typeof vi.fn>
const mPath = resolveWslPath as ReturnType<typeof vi.fn>

describe('readOpenCodeActiveModel', () => {
  beforeEach(() => {
    mEnv.mockReset()
    mFile.mockReset()
    mPath.mockReset()
  })

  it('parses plain JSON with provider-prefixed model', async () => {
    mEnv.mockResolvedValue(null)
    mPath.mockResolvedValue('/home/u/.config/opencode/opencode.json')
    mFile.mockResolvedValue('{"model": "anthropic/claude-sonnet-4-5"}')
    await expect(readOpenCodeActiveModel()).resolves.toEqual({
      modelId: 'anthropic/claude-sonnet-4-5',
    })
  })

  it('parses JSONC with // comments', async () => {
    mEnv.mockResolvedValue(null)
    mPath.mockResolvedValue('/home/u/.config/opencode/opencode.json')
    mFile.mockResolvedValue(`// my config
{
  "model": "openai/gpt-5.4" // current
}`)
    await expect(readOpenCodeActiveModel()).resolves.toEqual({ modelId: 'openai/gpt-5.4' })
  })

  it('honors $OPENCODE_CONFIG override', async () => {
    mEnv.mockResolvedValue('/custom/path/opencode.json')
    mPath.mockResolvedValue('/custom/path/opencode.json')
    mFile.mockResolvedValue('{"model": "google/gemini-2.5-pro"}')
    await expect(readOpenCodeActiveModel()).resolves.toEqual({
      modelId: 'google/gemini-2.5-pro',
    })
  })

  it('returns {modelId: null} on missing file', async () => {
    mEnv.mockResolvedValue(null)
    mPath.mockResolvedValue('/home/u/.config/opencode/opencode.json')
    mFile.mockResolvedValue(null)
    await expect(readOpenCodeActiveModel()).resolves.toEqual({ modelId: null })
  })
})
