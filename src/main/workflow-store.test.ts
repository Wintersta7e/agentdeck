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
    {
      id: 'role-uuid-docwriter',
      name: 'Documentation Writer',
      builtin: true,
      icon: '',
      persona: '',
    },
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
  renameWorkflow,
  deleteWorkflow,
} from './workflow-store'
import { KNOWN_AGENT_IDS } from '../shared/agents'
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

describe('renameWorkflow', () => {
  // A workflow containing a custom-agent node — the id isn't in the builtin set,
  // so re-validation on save must use the merged registry id set the IPC handler
  // forwards, not the builtin-only default.
  const merged = new Set([...KNOWN_AGENT_IDS, 'my-agent'])

  async function seedCustomAgentWorkflow(id: string): Promise<void> {
    // Seed through saveWorkflow (with the merged id set so the seed itself
    // validates) — this writes to the real getWorkflowsDir()/<id>.json path.
    await saveWorkflow(
      {
        id,
        name: 'Old name',
        nodes: [{ id: 'n1', type: 'agent', name: 'Step', x: 0, y: 0, agent: 'my-agent' }],
        edges: [],
        createdAt: 1,
        updatedAt: 1,
      },
      merged,
    )
  }

  it('renames a workflow whose node references a custom agent (merged id set)', async () => {
    await seedCustomAgentWorkflow('wf-custom')

    await expect(renameWorkflow('wf-custom', 'New name', merged)).resolves.toBeUndefined()
    const reloaded = await loadWorkflow('wf-custom')
    expect(reloaded?.name).toBe('New name')
  })

  it('rejects the same rename when no merged id set is passed (builtin-only default)', async () => {
    await seedCustomAgentWorkflow('wf-custom2')

    await expect(renameWorkflow('wf-custom2', 'New name')).rejects.toThrow(
      /Unknown agent: my-agent/,
    )
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
    // validateWorkflow rejects ids containing dots/slashes
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

// seedWorkflows behavior is covered in src/main/workflow-seeds.test.ts.
