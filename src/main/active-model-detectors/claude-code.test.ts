import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./_shared', () => ({
  readWslEnv: vi.fn(),
  readWslFile: vi.fn(),
  resolveWslPath: vi.fn(),
}))

import { readWslEnv, readWslFile, resolveWslPath } from './_shared'
import { readClaudeCodeActiveModel } from './claude-code'

const mEnv = readWslEnv as ReturnType<typeof vi.fn>
const mFile = readWslFile as ReturnType<typeof vi.fn>
const mPath = resolveWslPath as ReturnType<typeof vi.fn>

describe('readClaudeCodeActiveModel', () => {
  beforeEach(() => {
    mEnv.mockReset()
    mFile.mockReset()
    mPath.mockReset()
  })

  it('reads model from $CLAUDE_CONFIG_DIR/settings.json', async () => {
    mEnv.mockResolvedValue('/home/u/.claude')
    mPath.mockResolvedValue('/home/u/.claude/settings.json')
    mFile.mockResolvedValue(JSON.stringify({ model: 'claude-opus-4-7[1m]' }))
    await expect(readClaudeCodeActiveModel()).resolves.toEqual({ modelId: 'claude-opus-4-7[1m]' })
  })

  it('falls back to ~/.claude/settings.json when env unset', async () => {
    mEnv.mockResolvedValue(null)
    mPath.mockResolvedValue('/home/u/.claude/settings.json')
    mFile.mockResolvedValue(JSON.stringify({ model: 'claude-sonnet-4-6' }))
    await expect(readClaudeCodeActiveModel()).resolves.toEqual({ modelId: 'claude-sonnet-4-6' })
  })

  it('returns {modelId:null} on missing file', async () => {
    mEnv.mockResolvedValue(null)
    mPath.mockResolvedValue('/home/u/.claude/settings.json')
    mFile.mockResolvedValue(null)
    await expect(readClaudeCodeActiveModel()).resolves.toEqual({ modelId: null })
  })

  it('returns {modelId:null} on malformed JSON', async () => {
    mEnv.mockResolvedValue(null)
    mPath.mockResolvedValue('/home/u/.claude/settings.json')
    mFile.mockResolvedValue('{not valid')
    await expect(readClaudeCodeActiveModel()).resolves.toEqual({ modelId: null })
  })

  it('returns {modelId:null} when model key absent', async () => {
    mEnv.mockResolvedValue(null)
    mPath.mockResolvedValue('/home/u/.claude/settings.json')
    mFile.mockResolvedValue(JSON.stringify({ theme: 'dark' }))
    await expect(readClaudeCodeActiveModel()).resolves.toEqual({ modelId: null })
  })
})
