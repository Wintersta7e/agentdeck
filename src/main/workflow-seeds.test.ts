import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock filesystem so the upgrade-cleanup branch is observable without touching disk.
const readdirMock = vi.fn<(dir: string) => Promise<string[]>>()
const rmMock = vi.fn<(p: string, opts?: object) => Promise<void>>()

vi.mock('fs', () => ({
  promises: {
    readdir: (dir: string) => readdirMock(dir),
    rm: (p: string, opts?: object) => rmMock(p, opts),
  },
}))

// Mock collaborators so the orchestrator runs against fakes.
const saveWorkflowMock = vi.fn<(w: unknown) => Promise<void>>()
vi.mock('./workflow-store', () => ({
  saveWorkflow: (w: unknown) => saveWorkflowMock(w),
  getWorkflowsDir: () => '/fake/workflows',
}))

const getRolesFromStoreMock = vi.fn<() => Array<{ id: string; name: string; builtin?: boolean }>>()
vi.mock('./project-store', () => ({
  getRolesFromStore: () => getRolesFromStoreMock(),
}))

// Stub the blueprints with a small, deterministic set so the orchestration body is the focus.
vi.mock('./workflow-seed-blueprints', () => ({
  SEED_WORKFLOWS: [
    {
      id: 'seed-wf-test-1',
      name: 'Test Workflow',
      description: 'Fixture used by workflow-seeds.test.ts',
      nodes: [
        {
          id: 'n-agent',
          type: 'agent',
          name: 'Agent',
          x: 0,
          y: 0,
          agent: 'claude-code',
          prompt: 'do',
        },
        { id: 'n-shell', type: 'shell', name: 'Shell', x: 100, y: 0, command: 'echo hi' },
        { id: 'n-check', type: 'checkpoint', name: 'Check', x: 200, y: 0, message: 'pause' },
        { id: 'n-cond', type: 'condition', name: 'Cond', x: 300, y: 0 },
      ],
      edges: [
        { id: 'e1', fromNodeId: 'n-agent', toNodeId: 'n-shell' },
        { id: 'e2', fromNodeId: 'n-shell', toNodeId: 'n-check' },
      ],
    },
    {
      id: 'seed-wf-with-role',
      name: 'Role Workflow',
      description: 'Uses _roleName to map to a builtin role',
      nodes: [
        {
          id: 'n-roled',
          type: 'agent',
          name: 'Reviewer',
          x: 0,
          y: 0,
          agent: 'codex',
          prompt: 'review',
          _roleName: 'Reviewer',
        },
      ],
      edges: [],
    },
    {
      id: 'seed-wf-fieldtest',
      name: 'Field Test Workflow',
      description: 'Round-trip test for extended SeedNode fields',
      nodes: [
        {
          id: 'a',
          type: 'agent',
          name: 'Agent Node',
          x: 0,
          y: 0,
          agent: 'claude-code',
          prompt: 'do something',
          continueOnError: true,
          timeout: 600000,
          retryCount: 1,
          retryDelayMs: 2000,
          skillId: 'global:lint-fix',
        },
        {
          id: 'c',
          type: 'condition',
          name: 'Condition Node',
          x: 100,
          y: 0,
          conditionMode: 'exitCode',
          conditionPattern: 'PASS',
        },
      ],
      edges: [{ id: 'e1', fromNodeId: 'a', toNodeId: 'c' }],
    },
  ],
}))

import { seedWorkflows } from './workflow-seeds'

type Prefs = {
  workflowSeedVersion?: number
  rolesSeedVersion?: number
  workflowLastRolesVersion?: number
}

function makeStore(initial: Prefs = {}): {
  get: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  data: { appPrefs: Prefs }
} {
  const data = { appPrefs: { ...initial } }
  const get = vi.fn((key: 'appPrefs') => data[key])
  const set = vi.fn((key: 'appPrefs', value: Prefs) => {
    data[key] = value
  })
  return { get, set, data }
}

beforeEach(() => {
  vi.clearAllMocks()
  readdirMock.mockResolvedValue([])
  rmMock.mockResolvedValue()
  saveWorkflowMock.mockResolvedValue()
  getRolesFromStoreMock.mockReturnValue([])
})

describe('seedWorkflows', () => {
  it('seeds all blueprints on a fresh install (no prior seed version)', async () => {
    const store = makeStore({}) // no version set
    await seedWorkflows(store as never)

    expect(saveWorkflowMock).toHaveBeenCalledTimes(3)
    // Old-seed cleanup must not run when there's no prior version.
    expect(readdirMock).not.toHaveBeenCalled()
  })

  it('skips work when current seed version is up to date and roles have not changed', async () => {
    const store = makeStore({
      workflowSeedVersion: 999,
      rolesSeedVersion: 1,
      workflowLastRolesVersion: 1,
    })

    await seedWorkflows(store as never)

    expect(saveWorkflowMock).not.toHaveBeenCalled()
    expect(store.set).not.toHaveBeenCalled()
  })

  it('re-seeds when roles have changed even if the seed version is current', async () => {
    const store = makeStore({
      workflowSeedVersion: 999,
      rolesSeedVersion: 2,
      workflowLastRolesVersion: 1,
    })

    await seedWorkflows(store as never)

    expect(saveWorkflowMock).toHaveBeenCalledTimes(3)
  })

  it('cleans up old seed workflows on upgrade (currentVersion > 0)', async () => {
    readdirMock.mockResolvedValue([
      'seed-wf-old-1.json',
      'seed-wf-old-2.json',
      'user-wf-keep.json', // not a seed prefix — must be ignored
      'README.md',
    ])

    const store = makeStore({
      workflowSeedVersion: 1, // upgrade path
    })

    await seedWorkflows(store as never)

    expect(rmMock).toHaveBeenCalledTimes(2)
    const removed = rmMock.mock.calls.map((c) => c[0])
    expect(removed).toContain('/fake/workflows/seed-wf-old-1.json')
    expect(removed).toContain('/fake/workflows/seed-wf-old-2.json')
  })

  it('persists the new seed/role versions in appPrefs after seeding', async () => {
    const store = makeStore({ rolesSeedVersion: 7 })

    await seedWorkflows(store as never)

    expect(store.set).toHaveBeenCalledWith(
      'appPrefs',
      expect.objectContaining({
        workflowSeedVersion: expect.any(Number),
        workflowLastRolesVersion: 7,
      }),
    )
  })

  it('maps _roleName to a builtin role id and drops the field from the persisted node', async () => {
    getRolesFromStoreMock.mockReturnValue([
      { id: 'role-builtin-reviewer', name: 'Reviewer', builtin: true },
      // Non-builtin role with the same name must be ignored — the map only contains builtins.
      { id: 'role-custom-reviewer', name: 'Reviewer', builtin: false },
    ])

    const store = makeStore({})
    await seedWorkflows(store as never)

    const roleWorkflow = saveWorkflowMock.mock.calls
      .map(
        (c) =>
          c[0] as { id: string; nodes: Array<{ id: string; roleId?: string; _roleName?: string }> },
      )
      .find((w) => w.id === 'seed-wf-with-role')

    expect(roleWorkflow).toBeDefined()
    const node = roleWorkflow!.nodes.find((n) => n.id === 'n-roled')
    expect(node?.roleId).toBe('role-builtin-reviewer')
    // _roleName is only used as a lookup key — it must not appear on the persisted node.
    expect(node?._roleName).toBeUndefined()
  })

  it('survives readdir failures during cleanup (warns, continues)', async () => {
    readdirMock.mockRejectedValue(new Error('EACCES'))

    const store = makeStore({ workflowSeedVersion: 1 })

    // Should NOT throw — orchestrator logs and continues.
    await expect(seedWorkflows(store as never)).resolves.toBeUndefined()
    expect(saveWorkflowMock).toHaveBeenCalledTimes(3)
  })

  it('materializes continueOnError, timeout, retry, skillId, and condition fields', async () => {
    const store = makeStore({})
    await seedWorkflows(store as never)

    const saved = saveWorkflowMock.mock.calls.map(
      (c) => c[0] as { id: string; nodes: Array<Record<string, unknown>> },
    )
    const wf = saved.find((w) => w.id === 'seed-wf-fieldtest')!
    const agent = wf.nodes.find((n) => n['id'] === 'a')!
    const cond = wf.nodes.find((n) => n['id'] === 'c')!

    expect(agent['continueOnError']).toBe(true)
    expect(agent['timeout']).toBe(600000)
    expect(agent['retryCount']).toBe(1)
    expect(agent['retryDelayMs']).toBe(2000)
    expect((agent as { skillId?: string }).skillId).toBe('global:lint-fix')
    expect((cond as { conditionMode?: string }).conditionMode).toBe('exitCode')
    expect((cond as { conditionPattern?: string }).conditionPattern).toBe('PASS')
  })
})
