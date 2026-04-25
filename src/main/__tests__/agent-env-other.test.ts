import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../wsl-paths', () => ({
  getWslHome: vi.fn().mockResolvedValue('/home/u'),
  readWslFileSafe: vi.fn().mockResolvedValue(null),
}))

vi.mock('../logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import { readWslFileSafe } from '../wsl-paths'
import { readOtherAgentSnapshot } from '../agent-env-other'

describe('agent-env-other.readOtherAgentSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('aider: minimal — reads .aider.conf.yml from user', async () => {
    vi.mocked(readWslFileSafe).mockImplementation(async (p: string) => {
      if (p === '/home/u/.aider.conf.yml') return 'model: gpt-4o\n'
      return null
    })
    const snap = await readOtherAgentSnapshot({ agentId: 'aider', projectPath: undefined })
    expect(snap.agentId).toBe('aider')
    expect(snap.supportLevel).toBe('minimal')
    expect(snap.config.find((c) => c.key === 'model')?.value).toBe('gpt-4o')
  })

  it('goose: reads ~/.config/goose/config.yaml and filters builtin extensions', async () => {
    vi.mocked(readWslFileSafe).mockImplementation(async (p: string) => {
      if (p.endsWith('config.yaml')) {
        return [
          'GOOSE_PROVIDER: anthropic',
          'GOOSE_MODEL: claude-3-5-sonnet',
          'extensions:',
          '  developer:',
          '    type: builtin',
          '  fetcher:',
          '    type: stdio',
          '    command: mcp-fetcher',
        ].join('\n')
      }
      return null
    })
    const snap = await readOtherAgentSnapshot({ agentId: 'goose', projectPath: undefined })
    expect(snap.agentId).toBe('goose')
    expect(snap.supportLevel).toBe('minimal')
    expect(snap.config.find((c) => c.key === 'provider')?.value).toBe('anthropic')
    // builtin filtered, only command-bearing extension remains
    expect(snap.mcpServers).toHaveLength(1)
    expect(snap.mcpServers[0]?.name).toBe('fetcher')
  })

  it('gemini-cli: future placeholder (supportLevel future, all sections empty)', async () => {
    const snap = await readOtherAgentSnapshot({ agentId: 'gemini-cli', projectPath: undefined })
    expect(snap.agentId).toBe('gemini-cli')
    expect(snap.supportLevel).toBe('future')
    expect(snap.hooks).toEqual([])
    expect(snap.skills).toEqual([])
    expect(snap.mcpServers).toEqual([])
    expect(snap.config).toEqual([])
  })

  it('amazon-q: future placeholder', async () => {
    const snap = await readOtherAgentSnapshot({ agentId: 'amazon-q', projectPath: undefined })
    expect(snap.supportLevel).toBe('future')
  })

  it('opencode: future placeholder', async () => {
    const snap = await readOtherAgentSnapshot({ agentId: 'opencode', projectPath: undefined })
    expect(snap.supportLevel).toBe('future')
  })

  it('throws on unknown agent id', async () => {
    await expect(
      readOtherAgentSnapshot({ agentId: 'fake' as never, projectPath: undefined }),
    ).rejects.toThrow(/unsupported/i)
  })
})
