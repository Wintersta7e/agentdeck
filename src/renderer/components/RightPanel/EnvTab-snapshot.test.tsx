import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EnvTab } from './EnvTab/EnvTab'
import { useAppStore } from '../../store/appStore'

const fullSnapshot = {
  agentId: 'claude-code',
  agentName: 'Claude Code',
  agentVersion: '1.0.0',
  supportLevel: 'full' as const,
  hooks: [
    { event: 'PreToolUse', scope: 'user', command: 'echo hi', matchers: ['Bash'] },
    { event: 'Stop', scope: 'project', command: 'echo done' },
  ],
  skills: [{ name: 'lint-fix', scope: 'user', path: '/home/u/.claude/skills/lint-fix/SKILL.md' }],
  mcpServers: [
    {
      name: 'github',
      type: 'stdio',
      scope: 'user',
      command: 'npx server-github',
      status: 'configured',
    },
  ],
  config: [{ key: 'model', value: 'claude-opus-4-7', scope: 'user' }],
  paths: {
    userConfigDir: '/home/u/.claude',
    projectConfigDir: '/home/u/proj/.claude',
    agentdeckRoot: '/home/u/.agentdeck',
    templateUserRoot: '/home/u/.agentdeck/templates',
    wslDistro: 'Ubuntu',
    wslHome: '/home/u',
    projectAgentdeckDir: '/home/u/proj/.agentdeck',
  },
}

const futureSnapshot = {
  ...fullSnapshot,
  agentId: 'gemini-cli',
  agentName: 'Gemini CLI',
  supportLevel: 'future' as const,
  hooks: [],
  skills: [],
  mcpServers: [],
  config: [],
}

describe('EnvTab (snapshot)', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as unknown as { window: { agentDeck: unknown } }).window.agentDeck = {
      env: {
        getAgentSnapshot: vi.fn().mockResolvedValue(fullSnapshot),
        getAgentPaths: vi.fn().mockResolvedValue({}),
      },
      log: { send: vi.fn() },
    }
    useAppStore.setState({
      sessions: {},
      activeSessionId: null,
      projects: [],
      agentVersions: {},
    } as never)
  })

  it('shows empty state when no active session', () => {
    render(<EnvTab />)
    expect(screen.getByText("Open a session to see its agent's environment.")).toBeInTheDocument()
  })

  it('renders all sections when snapshot loads (supportLevel=full)', async () => {
    useAppStore.setState({
      sessions: { s1: { id: 's1', projectId: 'p1', status: 'running' } as never },
      activeSessionId: 's1',
      projects: [{ id: 'p1', name: 'Proj', path: '/home/u/proj', agent: 'claude-code' } as never],
    } as never)
    render(<EnvTab />)
    await waitFor(() => expect(screen.getByText('PreToolUse')).toBeInTheDocument())
    expect(screen.getByText(/lint-fix/)).toBeInTheDocument()
    expect(screen.getAllByText(/github/).length).toBeGreaterThan(0)
    expect(screen.getByText(/model/)).toBeInTheDocument()
    // Paths footer should include the legacy debug fields
    expect(screen.getByText('agentdeckRoot')).toBeInTheDocument()
    expect(screen.getByText('WSL distro')).toBeInTheDocument()
  })

  it('renders FuturePlaceholder for supportLevel=future agents', async () => {
    vi.mocked(window.agentDeck.env.getAgentSnapshot).mockResolvedValueOnce(futureSnapshot)
    useAppStore.setState({
      sessions: { s1: { id: 's1', projectId: 'p1', agentOverride: 'gemini-cli' } as never },
      activeSessionId: 's1',
      projects: [{ id: 'p1', name: 'Proj', path: '/home/u/proj', agent: 'claude-code' } as never],
    } as never)
    render(<EnvTab />)
    await waitFor(() => expect(screen.getByText(/not yet supported/i)).toBeInTheDocument())
    // Paths footer still renders for future agents
    expect(screen.getByText('Paths')).toBeInTheDocument()
  })

  it('resolves agent via session.agentOverride > project.agent > claude-code', async () => {
    useAppStore.setState({
      sessions: { s1: { id: 's1', projectId: 'p1', agentOverride: 'codex' } as never },
      activeSessionId: 's1',
      projects: [{ id: 'p1', name: 'Proj', path: '/home/u/proj', agent: 'claude-code' } as never],
    } as never)
    render(<EnvTab />)
    await waitFor(() => {
      const calls = vi.mocked(window.agentDeck.env.getAgentSnapshot).mock.calls
      expect(calls[0]?.[0]?.agentId).toBe('codex')
    })
  })

  it('passes projectId (not projectPath) to the snapshot IPC', async () => {
    useAppStore.setState({
      sessions: { s1: { id: 's1', projectId: 'p1' } as never },
      activeSessionId: 's1',
      projects: [{ id: 'p1', path: '/home/u/proj', agent: 'claude-code' } as never],
    } as never)
    render(<EnvTab />)
    await waitFor(() => {
      const calls = vi.mocked(window.agentDeck.env.getAgentSnapshot).mock.calls
      expect(calls[0]?.[0]?.projectId).toBe('p1')
      expect((calls[0]?.[0] as Record<string, unknown>)['projectPath']).toBeUndefined()
    })
  })

  it('refresh button calls getAgentSnapshot with force=true', async () => {
    useAppStore.setState({
      sessions: { s1: { id: 's1', projectId: 'p1' } as never },
      activeSessionId: 's1',
      projects: [{ id: 'p1', path: '/home/u/proj', agent: 'claude-code' } as never],
    } as never)
    render(<EnvTab />)
    await waitFor(() => expect(screen.getByText('PreToolUse')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText(/refresh/i))
    await waitFor(() => {
      const last = vi.mocked(window.agentDeck.env.getAgentSnapshot).mock.calls.at(-1)
      expect(last?.[0]?.force).toBe(true)
    })
  })

  it('shows error when getAgentSnapshot rejects', async () => {
    vi.mocked(window.agentDeck.env.getAgentSnapshot).mockRejectedValueOnce(new Error('boom'))
    useAppStore.setState({
      sessions: { s1: { id: 's1', projectId: 'p1' } as never },
      activeSessionId: 's1',
      projects: [{ id: 'p1', path: '/home/u/proj', agent: 'claude-code' } as never],
    } as never)
    render(<EnvTab />)
    await waitFor(() => expect(screen.getByText(/Failed to load/)).toBeInTheDocument())
  })
})
