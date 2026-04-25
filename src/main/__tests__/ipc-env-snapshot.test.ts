import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ipcMain } from 'electron'
import { registerEnvIpc } from '../ipc/ipc-env'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

vi.mock('../agent-env-resolver', () => ({
  getAgentSnapshot: vi.fn().mockResolvedValue({
    agentId: 'claude-code',
    agentName: 'Claude Code',
    agentVersion: null,
    supportLevel: 'full',
    hooks: [],
    skills: [],
    mcpServers: [],
    config: [],
    paths: {
      userConfigDir: '/home/u/.claude',
      projectConfigDir: null,
      agentdeckRoot: null,
      templateUserRoot: null,
      wslDistro: null,
      wslHome: null,
      projectAgentdeckDir: null,
    },
  }),
  invalidateSnapshotCache: vi.fn(),
}))

vi.mock('../wsl-utils', () => ({
  getDefaultDistroAsync: vi.fn().mockResolvedValue('Ubuntu'),
}))

vi.mock('../wsl-paths', () => ({
  getWslHome: vi.fn().mockResolvedValue('/home/u'),
}))

vi.mock('../logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

describe('env:getAgentSnapshot', () => {
  let handler: (event: unknown, opts: unknown) => Promise<unknown>
  let getProjectPath: ((id: string) => string | null) & ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    getProjectPath = vi.fn((id: string) =>
      id === 'p1' ? '/home/u/proj' : null,
    ) as typeof getProjectPath
    registerEnvIpc({
      claudeConfigDir: '/home/u/.claude',
      codexHome: '/home/u/.codex',
      agentdeckRoot: '/home/u/.agentdeck',
      templateUserRoot: '/home/u/.agentdeck/templates',
      getProjectPath,
    })
    const calls = vi.mocked(ipcMain.handle).mock.calls
    const call = calls.find((c) => c[0] === 'env:getAgentSnapshot')
    expect(call).toBeDefined()
    handler = call![1] as (e: unknown, o: unknown) => Promise<unknown>
  })

  it('returns the snapshot from the resolver', async () => {
    const result = await handler(null, { agentId: 'claude-code' })
    expect(result).toMatchObject({ agentId: 'claude-code' })
  })

  it('resolves projectId to projectPath via getProjectPath', async () => {
    const { getAgentSnapshot } = await import('../agent-env-resolver')
    await handler(null, { agentId: 'claude-code', projectId: 'p1' })
    expect(getProjectPath).toHaveBeenCalledWith('p1')
    expect(getAgentSnapshot).toHaveBeenCalledWith({
      agentId: 'claude-code',
      projectPath: '/home/u/proj',
      force: false,
    })
  })

  it('passes force=true through', async () => {
    const { getAgentSnapshot } = await import('../agent-env-resolver')
    await handler(null, { agentId: 'claude-code', force: true })
    expect(getAgentSnapshot).toHaveBeenCalledWith({
      agentId: 'claude-code',
      projectPath: undefined,
      force: true,
    })
  })

  it('rejects unknown agentId', async () => {
    await expect(handler(null, { agentId: 'fake' })).rejects.toThrow(/invalid agent/i)
  })

  it('rejects non-object opts', async () => {
    await expect(handler(null, 'bad')).rejects.toThrow(/options object/i)
  })

  it('rejects unknown projectId (not in store)', async () => {
    await expect(handler(null, { agentId: 'codex', projectId: 'does-not-exist' })).rejects.toThrow(
      /unknown projectId/i,
    )
  })

  it('decorates snapshot.paths with EnvCtx footer fields (agentdeckRoot etc.)', async () => {
    const result = (await handler(null, { agentId: 'claude-code' })) as {
      paths: {
        userConfigDir: string | null
        agentdeckRoot: string | null
        templateUserRoot: string | null
      }
    }
    expect(result.paths.agentdeckRoot).toBe('/home/u/.agentdeck')
    expect(result.paths.templateUserRoot).toBe('/home/u/.agentdeck/templates')
    // Per-agent userConfigDir from the resolver must survive the decoration.
    expect(result.paths.userConfigDir).toBe('/home/u/.claude')
  })

  it('rejects non-string projectId', async () => {
    await expect(handler(null, { agentId: 'codex', projectId: 123 })).rejects.toThrow(
      /invalid projectId/i,
    )
  })

  it('rejects projectId with characters outside SAFE_ID_RE', async () => {
    await expect(handler(null, { agentId: 'codex', projectId: 'has spaces' })).rejects.toThrow(
      /invalid projectId/i,
    )
    await expect(handler(null, { agentId: 'codex', projectId: '../etc/passwd' })).rejects.toThrow(
      /invalid projectId/i,
    )
  })
})
