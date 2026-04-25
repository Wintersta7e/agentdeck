import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../wsl-paths', () => ({
  getClaudeConfigDir: vi.fn().mockResolvedValue('/home/u/.claude'),
  getWslHome: vi.fn().mockResolvedValue('/home/u'),
  readWslFileSafe: vi.fn().mockResolvedValue(null),
}))

vi.mock('../wsl-utils', () => ({
  getDefaultDistroAsync: vi.fn().mockResolvedValue('Ubuntu'),
}))

vi.mock('../skill-scanner', () => ({
  scanSkillDirectory: vi.fn().mockResolvedValue({ skills: [], skipped: 0, status: 'ok' }),
}))

vi.mock('../logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import { readWslFileSafe } from '../wsl-paths'
import { scanSkillDirectory } from '../skill-scanner'
import { readClaudeSnapshot } from '../agent-env-claude'

describe('agent-env-claude.readClaudeSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses hooks from user settings.json with user scope', async () => {
    vi.mocked(readWslFileSafe).mockImplementation(async (p: string) => {
      if (p === '/home/u/.claude/settings.json') {
        return JSON.stringify({
          model: 'claude-opus-4-7',
          hooks: {
            PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo before' }] }],
            PostToolUse: [{ hooks: [{ type: 'command', command: 'echo after' }] }],
          },
        })
      }
      return null
    })

    const snap = await readClaudeSnapshot({ projectPath: undefined })
    expect(snap.supportLevel).toBe('full')
    expect(snap.hooks).toHaveLength(2)
    expect(snap.hooks[0]).toMatchObject({
      event: 'PreToolUse',
      scope: 'user',
      command: 'echo before',
      matchers: ['Bash'],
    })
    expect(snap.hooks[1]).toMatchObject({
      event: 'PostToolUse',
      scope: 'user',
      command: 'echo after',
    })
  })

  it('merges hooks from project settings.json with project scope', async () => {
    vi.mocked(readWslFileSafe).mockImplementation(async (p: string) => {
      if (p === '/home/u/.claude/settings.json') {
        return JSON.stringify({
          hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo user-stop' }] }] },
        })
      }
      if (p === '/home/u/proj/.claude/settings.json') {
        return JSON.stringify({
          hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo proj-stop' }] }] },
        })
      }
      return null
    })

    const snap = await readClaudeSnapshot({ projectPath: '/home/u/proj' })
    expect(snap.hooks.find((h) => h.scope === 'user')?.command).toBe('echo user-stop')
    expect(snap.hooks.find((h) => h.scope === 'project')?.command).toBe('echo proj-stop')
  })

  it('reads MCP servers from ~/.claude.json (canonical user-scope source)', async () => {
    vi.mocked(readWslFileSafe).mockImplementation(async (p: string) => {
      if (p === '/home/u/.claude.json') {
        return JSON.stringify({
          mcpServers: {
            context7: { url: 'https://mcp.context7.com/mcp', type: 'http' },
            memory: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] },
          },
        })
      }
      if (p.endsWith('settings.json')) return '{}'
      return null
    })

    const snap = await readClaudeSnapshot({ projectPath: undefined })
    expect(snap.mcpServers).toHaveLength(2)
    const ctx7 = snap.mcpServers.find((s) => s.name === 'context7')
    expect(ctx7?.scope).toBe('user')
    expect(ctx7?.type).toBe('http')
    expect(ctx7?.url).toBe('https://mcp.context7.com/mcp')
    const memory = snap.mcpServers.find((s) => s.name === 'memory')
    expect(memory?.type).toBe('stdio')
    expect(memory?.command).toContain('npx')
  })

  it('reads project-user-override MCP from ~/.claude.json projects[<path>].mcpServers', async () => {
    vi.mocked(readWslFileSafe).mockImplementation(async (p: string) => {
      if (p === '/home/u/.claude.json') {
        return JSON.stringify({
          mcpServers: {
            'user-server': { command: 'user-cmd' },
          },
          projects: {
            '/home/u/proj': {
              mcpServers: {
                'project-override': { command: 'proj-cmd' },
              },
            },
          },
        })
      }
      if (p.endsWith('settings.json')) return '{}'
      return null
    })

    const snap = await readClaudeSnapshot({ projectPath: '/home/u/proj' })
    const names = snap.mcpServers.map((s) => s.name)
    expect(names).toContain('user-server')
    expect(names).toContain('project-override')
  })

  it('reads legacy ~/.claude/mcp.json when present (back-compat)', async () => {
    vi.mocked(readWslFileSafe).mockImplementation(async (p: string) => {
      if (p === '/home/u/.claude/mcp.json') {
        return JSON.stringify({
          mcpServers: {
            github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
          },
        })
      }
      if (p.endsWith('settings.json')) return '{}'
      return null
    })

    const snap = await readClaudeSnapshot({ projectPath: undefined })
    expect(snap.mcpServers).toHaveLength(1)
    expect(snap.mcpServers[0]?.name).toBe('github')
    expect(snap.mcpServers[0]?.scope).toBe('user')
    expect(snap.mcpServers[0]?.type).toBe('stdio')
  })

  it('reads project-committed <project>/.mcp.json with project scope', async () => {
    vi.mocked(readWslFileSafe).mockImplementation(async (p: string) => {
      if (p === '/home/u/proj/.mcp.json') {
        return JSON.stringify({
          mcpServers: { 'committed-mcp': { command: 'team-cmd' } },
        })
      }
      if (p.endsWith('settings.json')) return '{}'
      return null
    })

    const snap = await readClaudeSnapshot({ projectPath: '/home/u/proj' })
    const committed = snap.mcpServers.find((s) => s.name === 'committed-mcp')
    expect(committed?.scope).toBe('project')
  })

  it('extracts skills from user + project scopes', async () => {
    vi.mocked(readWslFileSafe).mockResolvedValue(null)
    vi.mocked(scanSkillDirectory).mockImplementation(async (rootPath: string, scope) => {
      const isUser = rootPath === '/home/u/.claude/skills'
      return {
        skills: [
          {
            id: `${scope}:${isUser ? 'user-skill' : 'proj-skill'}`,
            name: isUser ? 'user-skill' : 'proj-skill',
            description: '',
            path: `${rootPath}/${isUser ? 'user-skill' : 'proj-skill'}/SKILL.md`,
            scope,
          },
        ],
        skipped: 0,
        status: 'ok',
      }
    })

    const snap = await readClaudeSnapshot({ projectPath: '/home/u/proj' })
    expect(snap.skills.find((s) => s.scope === 'user')?.name).toBe('user-skill')
    expect(snap.skills.find((s) => s.scope === 'project')?.name).toBe('proj-skill')
  })

  it('returns empty arrays when no Claude config exists', async () => {
    vi.mocked(readWslFileSafe).mockResolvedValue(null)

    const snap = await readClaudeSnapshot({ projectPath: undefined })
    expect(snap.hooks).toEqual([])
    expect(snap.mcpServers).toEqual([])
    expect(snap.config).toEqual([])
  })

  it('extracts config summary keys (model, env, statusLine, permissions.defaultMode)', async () => {
    vi.mocked(readWslFileSafe).mockImplementation(async (p: string) => {
      if (p === '/home/u/.claude/settings.json') {
        return JSON.stringify({
          model: 'claude-opus-4-7',
          env: { FOO: 'bar' },
          statusLine: { command: 'echo statusline' },
          permissions: { defaultMode: 'auto' },
        })
      }
      return null
    })

    const snap = await readClaudeSnapshot({ projectPath: undefined })
    const keys = snap.config.map((c) => c.key)
    expect(keys).toContain('model')
    expect(keys).toContain('env')
    expect(keys).toContain('statusLine.command')
    expect(keys).toContain('permissions.defaultMode')
  })

  it('paths.userConfigDir tracks getClaudeConfigDir result', async () => {
    vi.mocked(readWslFileSafe).mockResolvedValue(null)
    const snap = await readClaudeSnapshot({ projectPath: '/home/u/proj' })
    expect(snap.paths.userConfigDir).toBe('/home/u/.claude')
    expect(snap.paths.projectConfigDir).toBe('/home/u/proj/.claude')
  })
})
