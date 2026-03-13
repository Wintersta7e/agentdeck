import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock project-store before importing workflow-store
vi.mock('./project-store', () => ({
  getRolesFromStore: vi.fn(() => [
    { id: 'role-uuid-reviewer', name: 'Reviewer', builtin: true, icon: '', persona: '' },
    { id: 'role-uuid-developer', name: 'Developer', builtin: true, icon: '', persona: '' },
    { id: 'role-uuid-tester', name: 'Tester', builtin: true, icon: '', persona: '' },
    { id: 'role-uuid-architect', name: 'Architect', builtin: true, icon: '', persona: '' },
    { id: 'role-uuid-security', name: 'Security Auditor', builtin: true, icon: '', persona: '' },
    { id: 'role-uuid-refactorer', name: 'Refactorer', builtin: true, icon: '', persona: '' },
    { id: 'role-uuid-debugger', name: 'Debugger', builtin: true, icon: '', persona: '' },
  ]),
}))

// Mock fs and electron before importing module
vi.mock('fs', () => {
  const store = new Map<string, string>()
  return {
    mkdirSync: vi.fn(),
    promises: {
      readdir: vi.fn(async () => [...store.keys()].map((k) => k.split('/').pop() ?? '')),
      readFile: vi.fn(async (filepath: string) => {
        const data = store.get(filepath)
        if (data === undefined) {
          const err = new Error(`ENOENT: no such file`) as NodeJS.ErrnoException
          err.code = 'ENOENT'
          throw err
        }
        return data
      }),
      writeFile: vi.fn(async (filepath: string, data: string) => {
        store.set(filepath, data)
      }),
      rename: vi.fn(async (src: string, dest: string) => {
        const data = store.get(src)
        if (data === undefined) {
          const err = new Error(`ENOENT: no such file`) as NodeJS.ErrnoException
          err.code = 'ENOENT'
          throw err
        }
        store.delete(src)
        store.set(dest, data)
      }),
      rm: vi.fn(async (filepath: string) => {
        store.delete(filepath)
      }),
    },
    // Expose the internal store for test manipulation
    __testStore: store,
  }
})

import {
  listWorkflows,
  loadWorkflow,
  saveWorkflow,
  deleteWorkflow,
  seedWorkflows,
} from './workflow-store'
import * as fs from 'fs'

const testStore = (fs as unknown as { __testStore: Map<string, string> }).__testStore

beforeEach(() => {
  vi.clearAllMocks()
  testStore.clear()
})

describe('listWorkflows', () => {
  it('returns empty array for empty directory', async () => {
    const result = await listWorkflows()
    expect(result).toEqual([])
  })

  it('filters non-JSON files', async () => {
    vi.mocked(fs.promises.readdir).mockResolvedValueOnce([
      'wf1.json',
      'notes.txt',
      '.DS_Store',
    ] as never)
    testStore.set(
      expect.stringContaining('wf1'),
      JSON.stringify({ id: 'wf1', name: 'Test', nodes: [], updatedAt: 1000 }),
    )
    // readFile will be called for wf1.json
    vi.mocked(fs.promises.readFile).mockResolvedValueOnce(
      JSON.stringify({ id: 'wf1', name: 'Test', nodes: [1, 2], updatedAt: 1000 }),
    )

    const result = await listWorkflows()
    expect(result).toHaveLength(1)
    const first = result[0]
    expect(first).toBeDefined()
    expect(first?.name).toBe('Test')
    expect(first?.nodeCount).toBe(2)
  })

  it('skips malformed JSON files', async () => {
    vi.mocked(fs.promises.readdir).mockResolvedValueOnce(['bad.json', 'good.json'] as never)
    vi.mocked(fs.promises.readFile)
      .mockResolvedValueOnce('not json{{{')
      .mockResolvedValueOnce(
        JSON.stringify({ id: 'good', name: 'Good', nodes: [], updatedAt: 2000 }),
      )

    const result = await listWorkflows()
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('good')
  })
})

describe('loadWorkflow', () => {
  it('returns parsed workflow for valid JSON', async () => {
    const wf = { id: 'wf1', name: 'Test', nodes: [], edges: [], createdAt: 1, updatedAt: 2 }
    vi.mocked(fs.promises.readFile).mockResolvedValueOnce(JSON.stringify(wf))

    const result = await loadWorkflow('wf1')
    expect(result).toEqual(wf)
  })

  it('returns null for ENOENT', async () => {
    const err = new Error('not found') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    vi.mocked(fs.promises.readFile).mockRejectedValueOnce(err)

    const result = await loadWorkflow('nonexistent')
    expect(result).toBeNull()
  })
})

describe('saveWorkflow', () => {
  it('generates ID if missing', async () => {
    vi.mocked(fs.promises.writeFile).mockResolvedValueOnce(undefined)
    vi.mocked(fs.promises.rename).mockResolvedValueOnce(undefined)

    const result = await saveWorkflow({
      id: '',
      name: 'New WF',
      nodes: [],
      edges: [],
      createdAt: 0,
      updatedAt: 0,
    })
    expect(result.id).toBeTruthy()
    expect(result.id.length).toBeGreaterThan(0)
  })

  it('sets timestamps', async () => {
    vi.mocked(fs.promises.writeFile).mockResolvedValueOnce(undefined)
    vi.mocked(fs.promises.rename).mockResolvedValueOnce(undefined)
    const before = Date.now()

    const result = await saveWorkflow({
      id: 'wf-save',
      name: 'Test',
      nodes: [],
      edges: [],
      createdAt: 0,
      updatedAt: 0,
    })
    expect(result.updatedAt).toBeGreaterThanOrEqual(before)
    // createdAt should be set when original is falsy
    expect(result.createdAt).toBeGreaterThan(0)
  })

  it('preserves existing createdAt', async () => {
    vi.mocked(fs.promises.writeFile).mockResolvedValueOnce(undefined)
    vi.mocked(fs.promises.rename).mockResolvedValueOnce(undefined)

    const result = await saveWorkflow({
      id: 'wf-save',
      name: 'Test',
      nodes: [],
      edges: [],
      createdAt: 42,
      updatedAt: 0,
    })
    expect(result.createdAt).toBe(42)
  })
})

describe('deleteWorkflow', () => {
  it('calls rm with force', async () => {
    vi.mocked(fs.promises.rm).mockResolvedValueOnce(undefined)

    await deleteWorkflow('wf-del')
    expect(fs.promises.rm).toHaveBeenCalledWith(expect.stringContaining('wf-del'), { force: true })
  })
})

describe('safeId (via saveWorkflow path)', () => {
  it('rejects ids with path traversal characters via validation', async () => {
    // C2: validateWorkflow rejects ids containing dots/slashes
    await expect(
      saveWorkflow({
        id: 'wf/../../../etc/passwd',
        name: 'Evil',
        nodes: [],
        edges: [],
        createdAt: 1,
        updatedAt: 1,
      }),
    ).rejects.toThrow(/Invalid workflow id/)
  })
})

function createMockAppStore(prefs: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = {
    appPrefs: { zoomFactor: 1.0, ...prefs },
  }
  return {
    get: vi.fn((key: string) => data[key]),
    set: vi.fn((key: string, value: unknown) => {
      data[key] = value
    }),
  } as unknown as import('./project-store').AppStore
}

describe('seedWorkflows', () => {
  it('seeds 7 workflows on fresh install', async () => {
    const store = createMockAppStore()
    await seedWorkflows(store)
    const workflows = await listWorkflows()
    expect(workflows).toHaveLength(7)
    for (const wf of workflows) {
      expect(wf.id).toMatch(/^seed-wf-/)
    }
    expect(store.set).toHaveBeenCalledWith(
      'appPrefs',
      expect.objectContaining({
        workflowSeedVersion: 1,
      }),
    )
  })

  it('skips seeding when version is current', async () => {
    const store = createMockAppStore({ workflowSeedVersion: 1, workflowLastRolesVersion: 0 })
    await seedWorkflows(store)
    const workflows = await listWorkflows()
    expect(workflows).toHaveLength(0)
  })

  it('resolves role names to UUIDs', async () => {
    const store = createMockAppStore()
    await seedWorkflows(store)
    const lintFix = await loadWorkflow('seed-wf-lint-fix')
    expect(lintFix).not.toBeNull()
    const lintFixWf = lintFix ?? { nodes: [] as { name: string; roleId?: string }[] }
    const reviewerNode = lintFixWf.nodes.find((n) => n.name === 'Run Linter')
    expect(reviewerNode).toBeDefined()
    expect(reviewerNode?.roleId).toBe('role-uuid-reviewer')
    const devNode = lintFixWf.nodes.find((n) => n.name === 'Fix Errors')
    expect(devNode).toBeDefined()
    expect(devNode?.roleId).toBe('role-uuid-developer')
  })

  it('all agent nodes use codex with --full-auto --ephemeral', async () => {
    const store = createMockAppStore()
    await seedWorkflows(store)
    const workflows = await listWorkflows()
    for (const meta of workflows) {
      const wf = await loadWorkflow(meta.id)
      expect(wf).not.toBeNull()
      const wfNodes = wf ?? { nodes: [] as { type: string; agent?: string; agentFlags?: string }[] }
      for (const node of wfNodes.nodes) {
        if (node.type === 'agent') {
          expect(node.agent).toBe('codex')
          expect(node.agentFlags).toBe('--full-auto --ephemeral')
        }
      }
    }
  })

  it('checkpoint nodes use message field, not prompt', async () => {
    const store = createMockAppStore()
    await seedWorkflows(store)
    const codeReview = await loadWorkflow('seed-wf-code-review')
    expect(codeReview).not.toBeNull()
    const crNodes = codeReview ?? {
      nodes: [] as { type: string; message?: string; prompt?: string }[],
    }
    const checkpoint = crNodes.nodes.find((n) => n.type === 'checkpoint')
    expect(checkpoint).toBeDefined()
    expect(checkpoint?.message).toBeTruthy()
    expect(checkpoint?.prompt).toBeUndefined()
  })

  it('replaces seed workflows on upgrade, preserves user workflows', async () => {
    const store = createMockAppStore()
    await seedWorkflows(store)
    await saveWorkflow({
      id: 'my-custom-workflow',
      name: 'My Custom',
      nodes: [],
      edges: [],
      createdAt: 0,
      updatedAt: 0,
    })
    let all = await listWorkflows()
    expect(all).toHaveLength(8)
    const upgradeStore = createMockAppStore({ workflowSeedVersion: 0 })
    await seedWorkflows(upgradeStore)
    all = await listWorkflows()
    expect(all).toHaveLength(8)
    const custom = await loadWorkflow('my-custom-workflow')
    expect(custom).not.toBeNull()
    expect(custom?.name).toBe('My Custom')
  })

  it('all seed workflows pass validation', async () => {
    const store = createMockAppStore()
    await expect(seedWorkflows(store)).resolves.toBeUndefined()
  })
})
