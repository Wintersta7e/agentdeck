import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from '../store/appStore'

// Minimal window.agentDeck shim — set up before the module is imported.
const recordSession = vi.fn(async () => undefined)
const logSend = vi.fn()
globalThis.window = globalThis.window || ({} as Window & typeof globalThis)
Object.assign(globalThis.window, {
  agentDeck: {
    usage: {
      recordSession,
      getHistory: vi.fn(async () => []),
    },
    log: { send: logSend },
  },
})

const baseSession = {
  id: 's1',
  projectId: 'proj-1',
  status: 'exited' as const,
  startedAt: 1_000_000,
  approvalState: 'idle' as const,
  seedTemplateId: null,
}

const baseProject = {
  id: 'proj-1',
  name: 'Test Project',
  path: '/home/user/test',
  agents: [{ agent: 'aider', isDefault: true }],
}

describe('recordSessionUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState({
      sessions: {},
      projects: [],
      writeCountBySession: {},
    } as never)
  })

  it('calls usage.recordSession with resolved agent + projectId + filesChanged', async () => {
    useAppStore.setState({
      sessions: { s1: { ...baseSession, agentOverride: 'codex' } },
      projects: [baseProject],
      writeCountBySession: { s1: 7 },
    } as never)

    const { recordSessionUsage } = await import('./record-session-usage')
    recordSessionUsage('s1')

    // Flush the void promise chain
    await new Promise((r) => setTimeout(r, 0))

    expect(recordSession).toHaveBeenCalledTimes(1)
    expect(recordSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 's1',
        agent: 'codex', // agentOverride wins
        projectId: 'proj-1',
        filesChanged: 7,
      }),
    )
  })

  it('falls back to project default agent when no override', async () => {
    useAppStore.setState({
      sessions: { s1: { ...baseSession, agentOverride: undefined } },
      projects: [baseProject],
      writeCountBySession: {},
    } as never)

    const { recordSessionUsage } = await import('./record-session-usage')
    recordSessionUsage('s1')
    await new Promise((r) => setTimeout(r, 0))

    expect(recordSession).toHaveBeenCalledTimes(1)
    expect(recordSession).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'aider' }), // project default
    )
  })

  it('does NOT call usage.recordSession and DOES warn when sessionId is not found', async () => {
    // sessions is empty — 'missing' not found
    const { recordSessionUsage } = await import('./record-session-usage')
    recordSessionUsage('missing')
    await new Promise((r) => setTimeout(r, 0))

    expect(recordSession).not.toHaveBeenCalled()
    expect(logSend).toHaveBeenCalledWith('warn', 'usage', expect.stringContaining('not found'), {
      sessionId: 'missing',
    })
  })
})
