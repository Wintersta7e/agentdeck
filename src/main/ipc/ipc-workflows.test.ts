import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Workflow, Role } from '../../shared/types'
import { makeHandlersMap, makeIpcCall, makeIpcElectronMock } from '../../__test__/ipc-harness'

const handlers = makeHandlersMap()
vi.mock('electron', () => makeIpcElectronMock(handlers))

const loadWorkflowMock = vi.fn<(id: string) => Promise<Workflow | null>>(() =>
  Promise.resolve(null),
)
const saveWorkflowMock = vi.fn<(wf: Workflow) => Promise<Workflow>>((wf: Workflow) =>
  Promise.resolve({ ...wf, id: wf.id || 'minted-uuid' }),
)

vi.mock('../workflow-store', () => ({
  listWorkflows: vi.fn(() => Promise.resolve([])),
  loadWorkflow: (id: string) => loadWorkflowMock(id),
  saveWorkflow: (wf: Workflow) => saveWorkflowMock(wf),
  renameWorkflow: vi.fn(() => Promise.resolve()),
  deleteWorkflow: vi.fn(() => Promise.resolve()),
}))

vi.mock('../workflow-run-store', () => ({
  listRuns: vi.fn(() => Promise.resolve([])),
  deleteRun: vi.fn(() => Promise.resolve()),
}))

vi.mock('../wsl-utils', () => ({
  toWslPath: (p: string) => p,
}))

const { registerWorkflowHandlers } = await import('./ipc-workflows')

interface FakeEngine {
  run: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  resume: ReturnType<typeof vi.fn>
  isRunning: () => boolean
  getRunningWorkflows: () => string[]
  stopAll: () => void
}

function fakeEngine(): FakeEngine {
  return {
    run: vi.fn(),
    stop: vi.fn(),
    resume: vi.fn(),
    isRunning: () => false,
    getRunningWorkflows: () => [],
    stopAll: () => undefined,
  }
}

// Minimal AgentRegistry stand-in: the workflow handlers only read knownIds()
// for validateWorkflow. Builtins are enough; tests that need a custom id can
// pass their own set.
function fakeRegistry(
  extraIds: readonly string[] = [],
): Parameters<typeof registerWorkflowHandlers>[1] {
  const ids = new Set<string>(['claude-code', 'codex', ...extraIds])
  return { knownIds: () => ids } as unknown as Parameters<typeof registerWorkflowHandlers>[1]
}

function validWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: 'wf-1',
    name: 'WF',
    nodes: [{ id: 'n1', type: 'shell', name: 'do', command: 'echo hi', x: 0, y: 0 }],
    edges: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

const call = makeIpcCall(handlers)

describe('ipc-workflows', () => {
  beforeEach(() => {
    handlers.clear()
    registerWorkflowHandlers(() => null, fakeRegistry())
  })

  it('workflows:load rejects unsafe ids', () => {
    expect(() => call('workflows:load', './evil')).toThrow(/workflow/i)
  })

  it('workflows:save accepts new workflows without an id', () => {
    const saveSpy = vi.fn()
    handlers.clear()
    // Re-register so we capture saveWorkflow mock state
    registerWorkflowHandlers(() => null, fakeRegistry())
    // The concrete call should not throw; the underlying saveWorkflow mock just resolves.
    expect(() => call('workflows:save', { name: 'Fresh', nodes: [], edges: [] })).not.toThrow()
    void saveSpy
  })

  it('workflows:save rejects a present-but-unsafe id at the IPC boundary', () => {
    expect(() => call('workflows:save', { id: './x', name: 'X', nodes: [], edges: [] })).toThrow(
      /workflow ID/i,
    )
  })

  it('workflows:save accepts an empty-string id as a new-workflow signal', () => {
    // Renderer draft-builders set id: '' to satisfy the Workflow type before
    // saveWorkflow mints a UUID. Regression guard for the "Invalid workflow ID"
    // error users hit when clicking the starter cards in WorkflowsScreen.
    expect(() =>
      call('workflows:save', { id: '', name: 'Fresh', nodes: [], edges: [] }),
    ).not.toThrow()
  })

  it('workflows:rename rejects unsafe ids', () => {
    expect(() => call('workflows:rename', '..', 'new')).toThrow(/workflow id/i)
  })

  it('workflows:rename rejects over-length names', () => {
    expect(() => call('workflows:rename', 'valid-id', 'x'.repeat(300))).toThrow(/workflow name/i)
  })

  it('workflows:delete rejects unsafe ids', async () => {
    await expect(call('workflows:delete', '..') as Promise<unknown>).rejects.toThrow(/workflow/i)
  })

  it('workflows:export rejects unsafe ids', async () => {
    await expect(call('workflows:export', '..') as Promise<unknown>).rejects.toThrow(/workflow/i)
  })

  it('workflows:duplicate rejects unsafe ids', async () => {
    await expect(call('workflows:duplicate', '..') as Promise<unknown>).rejects.toThrow(/workflow/i)
  })

  it('workflows:save rejects a non-object payload', () => {
    expect(() => call('workflows:save', null)).toThrow(/Invalid workflow/)
    expect(() => call('workflows:save', 'not an object')).toThrow(/Invalid workflow/)
    expect(() => call('workflows:save', 42)).toThrow(/Invalid workflow/)
  })

  it('workflows:save rejects an id that is non-string non-empty', () => {
    expect(() => call('workflows:save', { id: 42, name: 'X', nodes: [], edges: [] })).toThrow(
      /Invalid workflow ID/i,
    )
    expect(() => call('workflows:save', { id: {}, name: 'X', nodes: [], edges: [] })).toThrow(
      /Invalid workflow ID/i,
    )
  })
})

describe('ipc-workflows :: workflows:import', () => {
  let getRolesMock: () => Role[]
  let saveRoleMock: (r: Role) => void
  let savedRoles: Role[]

  beforeEach(() => {
    handlers.clear()
    loadWorkflowMock.mockReset()
    saveWorkflowMock.mockReset()
    saveWorkflowMock.mockImplementation((wf: Workflow) =>
      Promise.resolve<Workflow>({ ...wf, id: wf.id || 'minted-uuid' }),
    )
    savedRoles = []
    getRolesMock = () => []
    saveRoleMock = (r) => {
      savedRoles.push(r)
    }
    registerWorkflowHandlers(
      () => null,
      fakeRegistry(),
      () => getRolesMock(),
      (r) => saveRoleMock(r),
    )
  })

  async function imp(data: unknown, strategy: unknown = {}): Promise<unknown> {
    return call('workflows:import', data, strategy)
  }

  it('rejects non-object data', async () => {
    await expect(imp(null)).rejects.toThrow(/Invalid import data/)
    await expect(imp('str')).rejects.toThrow(/Invalid import data/)
  })

  it('rejects unsupported format version', async () => {
    await expect(imp({ formatVersion: 2, workflow: validWorkflow(), roles: [] })).rejects.toThrow(
      /Unsupported format version/,
    )
  })

  it('rejects missing workflow', async () => {
    await expect(imp({ formatVersion: 1, roles: [] })).rejects.toThrow(/Missing workflow/)
  })

  it('rejects missing roles array', async () => {
    await expect(imp({ formatVersion: 1, workflow: validWorkflow() })).rejects.toThrow(
      /Missing roles array/,
    )
  })

  it('rejects a bundled role whose fields are invalid', async () => {
    // Missing required `persona` triggers validateRole rejection.
    await expect(
      imp({
        formatVersion: 1,
        workflow: validWorkflow(),
        roles: [{ id: 'r1', name: 'X', icon: '★', builtin: false }],
      }),
    ).rejects.toThrow(/Invalid bundled role/)
  })

  it('rejects an imported workflow with structural validation errors', async () => {
    // Edge pointing to a missing node — validateWorkflow rejects this.
    const broken = validWorkflow({
      nodes: [{ id: 'a', type: 'shell', name: 'a', command: 'x', x: 0, y: 0 }],
      edges: [{ id: 'e1', fromNodeId: 'a', toNodeId: 'ghost' }],
    })
    await expect(imp({ formatVersion: 1, workflow: broken, roles: [] })).rejects.toThrow(
      /Invalid workflow/,
    )
  })

  it('happy path: imports workflow with no roles, mints a new id, suffixes the name', async () => {
    const result = (await imp({ formatVersion: 1, workflow: validWorkflow(), roles: [] })) as {
      workflow: Workflow
      warnings: string[]
    }
    expect(saveWorkflowMock).toHaveBeenCalledTimes(1)
    expect(result.workflow.name).toMatch(/\(imported\)$/)
    expect(result.warnings).toEqual([])
  })

  it('downgrades an imported full-access agent node to edit (security)', async () => {
    const wf = validWorkflow({
      nodes: [
        {
          id: 'a',
          type: 'agent',
          name: 'risky',
          agent: 'codex',
          prompt: 'p',
          permission: 'full',
          x: 0,
          y: 0,
        },
      ],
    })
    const result = (await imp({ formatVersion: 1, workflow: wf, roles: [] })) as {
      workflow: Workflow
      warnings: string[]
    }
    const saved = saveWorkflowMock.mock.calls[0]?.[0] as Workflow
    const node = saved.nodes.find((n) => n.id === 'a')
    expect(node?.type).toBe('agent')
    if (node?.type === 'agent') {
      expect(node.permission).toBe('edit')
    }
    expect(result.warnings.some((w) => /downgraded to "edit"/.test(w))).toBe(true)
  })

  it('warns when a builtin role is not present locally and clears the roleId on agent nodes', async () => {
    const wf = validWorkflow({
      nodes: [
        { id: 'a1', type: 'agent', name: 'a', agent: 'claude-code', roleId: 'role-1', x: 0, y: 0 },
      ],
      edges: [],
    })
    const result = (await imp({
      formatVersion: 1,
      workflow: wf,
      roles: [{ id: 'role-1', name: 'GoneBuiltin', icon: '★', persona: 'p', builtin: true }],
    })) as { workflow: Workflow; warnings: string[] }
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/GoneBuiltin/)
    // Saved workflow should have the agent node's roleId cleared
    const saved = saveWorkflowMock.mock.calls[0]?.[0] as Workflow
    const agentNode = saved.nodes.find((n) => n.id === 'a1')
    expect(agentNode?.type).toBe('agent')
    if (agentNode?.type === 'agent') {
      expect(agentNode.roleId).toBeUndefined()
    }
  })

  it('remaps a builtin role to the matching local role by name', async () => {
    const localBuiltin: Role = {
      id: 'local-builtin-id',
      name: 'Reviewer',
      icon: '★',
      persona: 'local prompt',
      builtin: true,
    }
    getRolesMock = () => [localBuiltin]
    const wf = validWorkflow({
      nodes: [
        {
          id: 'a1',
          type: 'agent',
          name: 'a',
          agent: 'claude-code',
          roleId: 'imported-role-id',
          x: 0,
          y: 0,
        },
      ],
      edges: [],
    })
    await imp({
      formatVersion: 1,
      workflow: wf,
      roles: [{ id: 'imported-role-id', name: 'Reviewer', icon: '★', persona: 'p', builtin: true }],
    })
    const saved = saveWorkflowMock.mock.calls[0]?.[0] as Workflow
    const agentNode = saved.nodes.find((n) => n.id === 'a1')
    if (agentNode?.type === 'agent') {
      expect(agentNode.roleId).toBe(localBuiltin.id)
    }
  })

  it('custom role: skip strategy reuses the existing local role id', async () => {
    const local: Role = {
      id: 'local-custom',
      name: 'MyRole',
      icon: '★',
      persona: 'local',
      builtin: false,
    }
    getRolesMock = () => [local]
    const importedRoleId = 'imported-id-1'
    const wf = validWorkflow({
      nodes: [
        {
          id: 'a1',
          type: 'agent',
          name: 'a',
          agent: 'claude-code',
          roleId: importedRoleId,
          x: 0,
          y: 0,
        },
      ],
      edges: [],
    })
    await imp(
      {
        formatVersion: 1,
        workflow: wf,
        roles: [{ id: importedRoleId, name: 'MyRole', icon: '★', persona: 'p', builtin: false }],
      },
      { [importedRoleId]: 'skip' },
    )
    expect(savedRoles).toEqual([])
    const saved = saveWorkflowMock.mock.calls[0]?.[0] as Workflow
    const agentNode = saved.nodes.find((n) => n.id === 'a1')
    if (agentNode?.type === 'agent') {
      expect(agentNode.roleId).toBe(local.id)
    }
  })

  it('custom role: copy strategy creates a new role with "(imported)" suffix', async () => {
    const local: Role = {
      id: 'local-custom',
      name: 'MyRole',
      icon: '★',
      persona: 'local',
      builtin: false,
    }
    getRolesMock = () => [local]
    const importedRoleId = 'imported-id-1'
    const wf = validWorkflow({
      nodes: [
        {
          id: 'a1',
          type: 'agent',
          name: 'a',
          agent: 'claude-code',
          roleId: importedRoleId,
          x: 0,
          y: 0,
        },
      ],
      edges: [],
    })
    await imp(
      {
        formatVersion: 1,
        workflow: wf,
        roles: [{ id: importedRoleId, name: 'MyRole', icon: '★', persona: 'p', builtin: false }],
      },
      { [importedRoleId]: 'copy' },
    )
    expect(savedRoles).toHaveLength(1)
    expect(savedRoles[0]?.name).toBe('MyRole (imported)')
    expect(savedRoles[0]?.id).not.toBe(importedRoleId)
    // The agent node should reference the new role id, not the imported one
    const saved = saveWorkflowMock.mock.calls[0]?.[0] as Workflow
    const agentNode = saved.nodes.find((n) => n.id === 'a1')
    if (agentNode?.type === 'agent') {
      expect(agentNode.roleId).toBe(savedRoles[0]?.id)
    }
  })

  it('custom role with no local conflict: imports directly with a new uuid', async () => {
    getRolesMock = () => []
    const importedRoleId = 'imported-id-1'
    const wf = validWorkflow({
      nodes: [
        {
          id: 'a1',
          type: 'agent',
          name: 'a',
          agent: 'claude-code',
          roleId: importedRoleId,
          x: 0,
          y: 0,
        },
      ],
      edges: [],
    })
    await imp({
      formatVersion: 1,
      workflow: wf,
      roles: [{ id: importedRoleId, name: 'Fresh', icon: '★', persona: 'p', builtin: false }],
    })
    expect(savedRoles).toHaveLength(1)
    expect(savedRoles[0]?.name).toBe('Fresh')
    expect(savedRoles[0]?.id).not.toBe(importedRoleId)
  })
})

describe('ipc-workflows :: workflow:run', () => {
  let engine: FakeEngine

  beforeEach(() => {
    handlers.clear()
    loadWorkflowMock.mockReset()
    loadWorkflowMock.mockImplementation(() => Promise.resolve(validWorkflow()))
    engine = fakeEngine()
    // FakeEngine is structurally close enough for these handler tests; cast
    // through the WorkflowEngine surface without pulling in the full Mock type.
    registerWorkflowHandlers(
      () =>
        engine as unknown as Parameters<typeof registerWorkflowHandlers>[0] extends () => infer R
          ? R
          : never,
      fakeRegistry(),
    )
  })

  it('rejects an invalid workflow id', async () => {
    await expect(call('workflow:run', './evil') as Promise<unknown>).rejects.toThrow(/workflow ID/i)
  })

  it('rejects when the workflow does not exist', async () => {
    loadWorkflowMock.mockResolvedValueOnce(null)
    await expect(call('workflow:run', 'wf-1') as Promise<unknown>).rejects.toThrow(/not found/i)
  })

  it('rejects when the engine is uninitialized', async () => {
    handlers.clear()
    registerWorkflowHandlers(() => null, fakeRegistry())
    await expect(call('workflow:run', 'wf-1') as Promise<unknown>).rejects.toThrow(
      /engine not initialized/i,
    )
  })

  it('rejects an invalid variable name', async () => {
    await expect(
      call('workflow:run', 'wf-1', undefined, { 'bad-name': 'v' }) as Promise<unknown>,
    ).rejects.toThrow(/Invalid variable name/)
    await expect(
      call('workflow:run', 'wf-1', undefined, { '0LEADING': 'v' }) as Promise<unknown>,
    ).rejects.toThrow(/Invalid variable name/)
  })

  it('rejects a non-string variable value', async () => {
    await expect(
      call('workflow:run', 'wf-1', undefined, { FOO: 42 as unknown as string }) as Promise<unknown>,
    ).rejects.toThrow(/must be a string/)
  })

  it('rejects a variable value over 10000 characters', async () => {
    await expect(
      call('workflow:run', 'wf-1', undefined, { FOO: 'x'.repeat(10001) }) as Promise<unknown>,
    ).rejects.toThrow(/exceeds 10000/)
  })

  it('rejects a variables payload that is not a plain object', async () => {
    await expect(
      call('workflow:run', 'wf-1', undefined, ['array']) as Promise<unknown>,
    ).rejects.toThrow(/must be an object/)
  })

  it('rejects a projectPath containing path traversal', async () => {
    await expect(
      call('workflow:run', 'wf-1', '/home/user/../etc/passwd') as Promise<unknown>,
    ).rejects.toThrow(/path traversal/i)
  })

  it('rejects a non-absolute projectPath', async () => {
    await expect(call('workflow:run', 'wf-1', 'relative/path') as Promise<unknown>).rejects.toThrow(
      /absolute WSL path/i,
    )
  })

  it('rejects a projectPath over 1024 characters', async () => {
    const longPath = '/home/' + 'x'.repeat(1100)
    await expect(call('workflow:run', 'wf-1', longPath) as Promise<unknown>).rejects.toThrow(
      /absolute WSL path/i,
    )
  })

  it('happy path: passes accepted variables to engine.run', async () => {
    await call('workflow:run', 'wf-1', '/home/proj', { FOO_BAR: 'hello', BAZ: 'world' })
    expect(engine.run).toHaveBeenCalledTimes(1)
    const args = engine.run.mock.calls[0]
    expect(args?.[1]).toBe('/home/proj')
    expect(args?.[2]).toEqual({ FOO_BAR: 'hello', BAZ: 'world' })
  })
})
