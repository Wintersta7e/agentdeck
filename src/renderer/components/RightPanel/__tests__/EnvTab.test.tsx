import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { EnvTab } from '../EnvTab'
import { useAppStore } from '../../../store/appStore'

interface AgentPathsResult {
  claudeConfigDir: string | null
  codexHome: string | null
  agentdeckRoot: string
  templateUserRoot: string
}

const getAgentPaths = vi.fn<() => Promise<AgentPathsResult>>()

beforeEach(() => {
  getAgentPaths.mockReset()
  getAgentPaths.mockResolvedValue({
    claudeConfigDir: '/home/u/.claude',
    codexHome: null,
    agentdeckRoot: '/home/u/.agentdeck',
    templateUserRoot: '/home/u/.agentdeck/templates',
  })

  Object.defineProperty(window, 'agentDeck', {
    value: {
      env: { getAgentPaths },
      log: { send: vi.fn() },
    },
    writable: true,
    configurable: true,
  })

  useAppStore.setState({
    wslDistro: 'Ubuntu-24.04',
    agentVersions: {},
    agentStatus: {},
    sessions: {},
    activeSessionId: null,
    projects: [],
  } as never)
})

afterEach(() => {
  cleanup()
})

describe('EnvTab', () => {
  it('shows Loading… before IPC resolves', () => {
    // Make the IPC hang so loading state is visible.
    getAgentPaths.mockImplementation(() => new Promise(() => {}))
    render(<EnvTab />)
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
  })

  it('renders all four sections after IPC resolves', async () => {
    render(<EnvTab />)
    await waitFor(() => {
      expect(screen.getByText('Agent paths')).toBeInTheDocument()
    })
    expect(screen.getByText('WSL')).toBeInTheDocument()
    expect(screen.getByText('Agent versions')).toBeInTheDocument()
    expect(screen.getByText('Active project')).toBeInTheDocument()
  })

  it('shows "unset" when CODEX_HOME is null in IPC return', async () => {
    render(<EnvTab />)
    await waitFor(() => {
      expect(screen.getByText('CODEX_HOME')).toBeInTheDocument()
    })
    const codexRow = screen.getByText('CODEX_HOME').closest('.env-tab__row')
    expect(codexRow).not.toBeNull()
    expect(codexRow?.textContent).toMatch(/unset/)
  })

  it('shows "unset" when CLAUDE_CONFIG_DIR is null in IPC return', async () => {
    getAgentPaths.mockResolvedValue({
      claudeConfigDir: null,
      codexHome: null,
      agentdeckRoot: '/home/u/.agentdeck',
      templateUserRoot: '/home/u/.agentdeck/templates',
    })
    render(<EnvTab />)
    await waitFor(() => {
      expect(screen.getByText('CLAUDE_CONFIG_DIR')).toBeInTheDocument()
    })
    const row = screen.getByText('CLAUDE_CONFIG_DIR').closest('.env-tab__row')
    expect(row?.textContent).toMatch(/unset/)
  })

  it('renders WSL distro from store', async () => {
    render(<EnvTab />)
    await waitFor(() => {
      expect(screen.getByText('Ubuntu-24.04')).toBeInTheDocument()
    })
  })

  it('shows project paths when active session resolves to a project', async () => {
    useAppStore.setState({
      sessions: {
        s1: {
          id: 's1',
          projectId: 'p1',
          status: 'running',
          startedAt: 0,
          approvalState: 'idle',
          seedTemplateId: null,
        },
      },
      activeSessionId: 's1',
      projects: [{ id: 'p1', name: 'Demo', path: '/home/u/projects/demo' }],
    } as never)
    render(<EnvTab />)
    await waitFor(() => {
      expect(screen.getByText('/home/u/projects/demo/.agentdeck/')).toBeInTheDocument()
    })
    expect(screen.getByText('/home/u/projects/demo/.agentdeck/templates/')).toBeInTheDocument()
    // Worktree path uses the WSL home derived from agentdeckRoot.
    expect(screen.getByText('/home/u/.agentdeck/worktrees/')).toBeInTheDocument()
  })

  it('shows "No active project." when activeSessionId is null', async () => {
    render(<EnvTab />)
    await waitFor(() => {
      expect(screen.getByText('Active project')).toBeInTheDocument()
    })
    expect(screen.getByText(/No active project/)).toBeInTheDocument()
  })

  it('shows hint when no agent versions detected', async () => {
    render(<EnvTab />)
    await waitFor(() => {
      expect(screen.getByText('Agent versions')).toBeInTheDocument()
    })
    expect(screen.getByText(/Run agent detection from the Agents tab/)).toBeInTheDocument()
  })
})
