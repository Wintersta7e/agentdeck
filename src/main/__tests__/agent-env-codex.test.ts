import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../wsl-paths', () => ({
  getCodexHome: vi.fn().mockResolvedValue('/home/u/.codex'),
  readWslFileSafe: vi.fn().mockResolvedValue(null),
}))

vi.mock('../wsl-utils', () => ({
  getDefaultDistroAsync: vi.fn().mockResolvedValue('Ubuntu'),
  NODE_INIT: '',
}))

vi.mock('../skill-scanner', () => ({
  scanSkillDirectory: vi.fn().mockResolvedValue({
    skills: [
      {
        id: 'global:my-skill',
        name: 'my-skill',
        description: '',
        path: '/home/u/.codex/skills/my-skill/SKILL.md',
        scope: 'global',
      },
    ],
    skipped: 0,
    status: 'ok',
  }),
}))

vi.mock('../logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import { readWslFileSafe } from '../wsl-paths'
import { readCodexSnapshot } from '../agent-env-codex'

describe('agent-env-codex.readCodexSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts mcp_servers from config.toml', async () => {
    vi.mocked(readWslFileSafe).mockImplementation(async (p: string) => {
      if (p.endsWith('config.toml')) {
        return [
          'model = "gpt-5"',
          'sandbox = "workspace-write"',
          '',
          '[mcp_servers.github]',
          'command = "npx"',
          'args = ["-y", "@modelcontextprotocol/server-github"]',
        ].join('\n')
      }
      return null
    })
    const snap = await readCodexSnapshot({ projectPath: undefined })
    expect(snap.supportLevel).toBe('full')
    expect(snap.mcpServers).toHaveLength(1)
    expect(snap.mcpServers[0]?.name).toBe('github')
    expect(snap.mcpServers[0]?.type).toBe('stdio')
  })

  it('extracts config summary including model_reasoning_effort and personality (real-world keys)', async () => {
    vi.mocked(readWslFileSafe).mockResolvedValue(
      ['model = "gpt-5.5"', 'model_reasoning_effort = "xhigh"', 'personality = "pragmatic"'].join(
        '\n',
      ),
    )
    const snap = await readCodexSnapshot({ projectPath: undefined })
    const keys = snap.config.map((c) => c.key)
    expect(keys).toContain('model')
    expect(keys).toContain('model_reasoning_effort')
    expect(keys).toContain('personality')
  })

  it('extracts legacy config keys (sandbox, approval_policy) for back-compat', async () => {
    vi.mocked(readWslFileSafe).mockResolvedValue(
      ['model = "gpt-5"', 'sandbox = "workspace-write"', 'approval_policy = "on-failure"'].join(
        '\n',
      ),
    )
    const snap = await readCodexSnapshot({ projectPath: undefined })
    const keys = snap.config.map((c) => c.key)
    expect(keys).toContain('model')
    expect(keys).toContain('sandbox')
    expect(keys).toContain('approval_policy')
  })

  it('reports no hooks (Codex does not support user-defined hooks)', async () => {
    vi.mocked(readWslFileSafe).mockResolvedValue('')
    const snap = await readCodexSnapshot({ projectPath: undefined })
    expect(snap.hooks).toEqual([])
  })

  it('returns empty arrays when config.toml missing', async () => {
    vi.mocked(readWslFileSafe).mockResolvedValue(null)
    const snap = await readCodexSnapshot({ projectPath: undefined })
    expect(snap.config).toEqual([])
    expect(snap.mcpServers).toEqual([])
  })

  it('reports skills from $CODEX_HOME/skills via scanSkillDirectory', async () => {
    vi.mocked(readWslFileSafe).mockResolvedValue('')
    const snap = await readCodexSnapshot({ projectPath: undefined })
    expect(snap.skills).toHaveLength(1)
    expect(snap.skills[0]?.name).toBe('my-skill')
    expect(snap.skills[0]?.scope).toBe('user')
  })

  it('paths.userConfigDir tracks getCodexHome result', async () => {
    const snap = await readCodexSnapshot({ projectPath: undefined })
    expect(snap.paths.userConfigDir).toBe('/home/u/.codex')
  })
})
