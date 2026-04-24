import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./_shared', () => ({
  readWslEnv: vi.fn(),
  readWslFile: vi.fn(),
  resolveWslPath: vi.fn(),
}))

import { readWslFile, resolveWslPath } from './_shared'
import { readGeminiActiveModel } from './gemini'

const mFile = readWslFile as ReturnType<typeof vi.fn>
const mPath = resolveWslPath as ReturnType<typeof vi.fn>

describe('readGeminiActiveModel', () => {
  beforeEach(() => {
    mFile.mockReset()
    mPath.mockReset()
  })

  it('reads nested model.name (current Gemini CLI shape)', async () => {
    mPath.mockResolvedValue('/home/u/.gemini/settings.json')
    mFile.mockResolvedValue(JSON.stringify({ model: { name: 'gemini-2.5-pro' } }))
    await expect(readGeminiActiveModel()).resolves.toEqual({ modelId: 'gemini-2.5-pro' })
  })

  it('falls back to top-level string model (older shape)', async () => {
    mPath.mockResolvedValue('/home/u/.gemini/settings.json')
    mFile.mockResolvedValue(JSON.stringify({ model: 'gemini-2.5-pro' }))
    await expect(readGeminiActiveModel()).resolves.toEqual({ modelId: 'gemini-2.5-pro' })
  })

  it('returns {modelId: null} on missing file', async () => {
    mPath.mockResolvedValue('/home/u/.gemini/settings.json')
    mFile.mockResolvedValue(null)
    await expect(readGeminiActiveModel()).resolves.toEqual({ modelId: null })
  })

  it('returns {modelId: null} on malformed JSON', async () => {
    mPath.mockResolvedValue('/home/u/.gemini/settings.json')
    mFile.mockResolvedValue('{broken')
    await expect(readGeminiActiveModel()).resolves.toEqual({ modelId: null })
  })
})
