import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FilesTab } from './FilesTab'
import { useAppStore } from '../../store/appStore'

describe('FilesTab (tree)', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as unknown as { window: { agentDeck: unknown } }).window.agentDeck = {
      files: {
        listDir: vi.fn().mockResolvedValue({ entries: [], gitignored: [] }),
        openExternal: vi.fn(),
      },
    }
    useAppStore.setState({
      sessions: {},
      activeSessionId: null,
      projects: [],
      worktreePaths: {},
    } as never)
  })

  it('shows empty state with exact spec copy when no active session', () => {
    render(<FilesTab />)
    expect(screen.getByText('No project — open a session to see its files.')).toBeInTheDocument()
  })

  it('shows empty state when active session has no project', () => {
    useAppStore.setState({
      sessions: {
        s1: { id: 's1', projectId: 'p-missing', status: 'running', activity: 'idle' } as never,
      },
      activeSessionId: 's1',
      projects: [],
    } as never)
    render(<FilesTab />)
    expect(screen.getByText('No project — open a session to see its files.')).toBeInTheDocument()
  })

  it('renders FileTree rooted at project.path when session is bound', async () => {
    useAppStore.setState({
      sessions: {
        s1: { id: 's1', projectId: 'p1', status: 'running', activity: 'idle' } as never,
      },
      activeSessionId: 's1',
      projects: [{ id: 'p1', name: 'My Project', path: '/home/u/proj' } as never],
    } as never)
    vi.mocked(window.agentDeck.files.listDir).mockResolvedValueOnce({
      entries: [{ name: 'README.md', isDir: false }],
      gitignored: [],
    })
    render(<FilesTab />)
    await waitFor(() => expect(screen.getByText('README.md')).toBeInTheDocument())
    const calls = vi.mocked(window.agentDeck.files.listDir).mock.calls
    expect(calls[0]?.[0]).toEqual({ path: '/home/u/proj', projectPath: '/home/u/proj' })
  })

  it('uses worktree path when session has isolated worktree', async () => {
    useAppStore.setState({
      sessions: {
        s1: { id: 's1', projectId: 'p1', status: 'running', activity: 'idle' } as never,
      },
      activeSessionId: 's1',
      projects: [{ id: 'p1', name: 'My Project', path: '/home/u/proj' } as never],
      worktreePaths: { s1: { path: '/home/u/proj-wt-feature', isolated: true } },
    } as never)
    vi.mocked(window.agentDeck.files.listDir).mockResolvedValueOnce({
      entries: [{ name: 'index.ts', isDir: false }],
      gitignored: [],
    })
    render(<FilesTab />)
    await waitFor(() => expect(screen.getByText('index.ts')).toBeInTheDocument())
    const calls = vi.mocked(window.agentDeck.files.listDir).mock.calls
    expect(calls[0]?.[0]).toEqual({
      path: '/home/u/proj-wt-feature',
      projectPath: '/home/u/proj-wt-feature',
    })
    expect(screen.getByText(/worktree/i)).toBeInTheDocument()
  })

  it('refresh button forces a remount and re-fetches the root', async () => {
    useAppStore.setState({
      sessions: {
        s1: { id: 's1', projectId: 'p1', status: 'running', activity: 'idle' } as never,
      },
      activeSessionId: 's1',
      projects: [{ id: 'p1', name: 'My Project', path: '/home/u/proj' } as never],
    } as never)
    vi.mocked(window.agentDeck.files.listDir).mockResolvedValue({
      entries: [{ name: 'README.md', isDir: false }],
      gitignored: [],
    })
    render(<FilesTab />)
    await waitFor(() => expect(screen.getByText('README.md')).toBeInTheDocument())
    const callsBefore = vi
      .mocked(window.agentDeck.files.listDir)
      .mock.calls.filter((c) => c[0]?.path === '/home/u/proj').length
    expect(callsBefore).toBe(1)

    fireEvent.click(screen.getByLabelText(/refresh/i))

    await waitFor(() => {
      const callsAfter = vi
        .mocked(window.agentDeck.files.listDir)
        .mock.calls.filter((c) => c[0]?.path === '/home/u/proj').length
      // Must have re-fetched the ROOT path specifically, proving remount.
      expect(callsAfter).toBe(2)
    })
  })
})
