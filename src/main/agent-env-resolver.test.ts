import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./agent-env-claude', () => ({
  readClaudeSnapshot: vi.fn().mockResolvedValue({
    agentId: 'claude-code',
    agentName: 'Claude Code',
    agentVersion: null,
    supportLevel: 'full' as const,
    hooks: [],
    skills: [],
    mcpServers: [],
    config: [],
    paths: {
      userConfigDir: null,
      projectConfigDir: null,
      agentdeckRoot: null,
      templateUserRoot: null,
      wslDistro: null,
      wslHome: null,
      projectAgentdeckDir: null,
    },
  }),
}))
vi.mock('./agent-env-codex', () => ({
  readCodexSnapshot: vi.fn().mockResolvedValue({
    agentId: 'codex',
    agentName: 'Codex',
    agentVersion: null,
    supportLevel: 'full' as const,
    hooks: [],
    skills: [],
    mcpServers: [],
    config: [],
    paths: {
      userConfigDir: null,
      projectConfigDir: null,
      agentdeckRoot: null,
      templateUserRoot: null,
      wslDistro: null,
      wslHome: null,
      projectAgentdeckDir: null,
    },
  }),
}))
vi.mock('./agent-env-other', () => ({
  readOtherAgentSnapshot: vi.fn().mockResolvedValue({
    agentId: 'aider',
    agentName: 'Aider',
    agentVersion: null,
    supportLevel: 'full' as const,
    hooks: [],
    skills: [],
    mcpServers: [],
    config: [],
    paths: {
      userConfigDir: null,
      projectConfigDir: null,
      agentdeckRoot: null,
      templateUserRoot: null,
      wslDistro: null,
      wslHome: null,
      projectAgentdeckDir: null,
    },
  }),
}))
vi.mock('./logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import { getAgentSnapshot, invalidateSnapshotCache } from './agent-env-resolver'
import { readClaudeSnapshot } from './agent-env-claude'
import { readCodexSnapshot } from './agent-env-codex'
import { readOtherAgentSnapshot } from './agent-env-other'

describe('agent-env-resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateSnapshotCache()
  })

  it('dispatches claude-code to readClaudeSnapshot', async () => {
    const snap = await getAgentSnapshot({ agentId: 'claude-code', projectPath: '/home/u/proj' })
    expect(readClaudeSnapshot).toHaveBeenCalledTimes(1)
    expect(snap.agentId).toBe('claude-code')
  })

  it('dispatches codex to readCodexSnapshot', async () => {
    await getAgentSnapshot({ agentId: 'codex' })
    expect(readCodexSnapshot).toHaveBeenCalledTimes(1)
  })

  it('dispatches other agents to readOtherAgentSnapshot', async () => {
    await getAgentSnapshot({ agentId: 'aider' })
    expect(readOtherAgentSnapshot).toHaveBeenCalledTimes(1)
  })

  it('caches by [agentId, projectPath] for 30s TTL', async () => {
    await getAgentSnapshot({ agentId: 'claude-code', projectPath: '/home/u/proj' })
    await getAgentSnapshot({ agentId: 'claude-code', projectPath: '/home/u/proj' })
    expect(readClaudeSnapshot).toHaveBeenCalledTimes(1)
  })

  it('different projectPath produces a different cache key', async () => {
    await getAgentSnapshot({ agentId: 'claude-code', projectPath: '/home/u/a' })
    await getAgentSnapshot({ agentId: 'claude-code', projectPath: '/home/u/b' })
    expect(readClaudeSnapshot).toHaveBeenCalledTimes(2)
  })

  it('force=true bypasses the cache', async () => {
    await getAgentSnapshot({ agentId: 'claude-code', projectPath: '/home/u/proj' })
    await getAgentSnapshot({ agentId: 'claude-code', projectPath: '/home/u/proj', force: true })
    expect(readClaudeSnapshot).toHaveBeenCalledTimes(2)
  })

  it('rejects unknown agent ids', async () => {
    await expect(getAgentSnapshot({ agentId: 'fake-agent' as unknown as 'codex' })).rejects.toThrow(
      /unknown agent/i,
    )
  })

  it('deduplicates concurrent requests for the same key (in-flight)', async () => {
    const p1 = getAgentSnapshot({ agentId: 'claude-code', projectPath: '/home/u/proj' })
    const p2 = getAgentSnapshot({ agentId: 'claude-code', projectPath: '/home/u/proj' })
    await Promise.all([p1, p2])
    expect(readClaudeSnapshot).toHaveBeenCalledTimes(1)
  })
})
