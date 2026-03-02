import { describe, it, expect, vi, beforeEach } from 'vitest'

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
      rm: vi.fn(async (filepath: string) => {
        store.delete(filepath)
      }),
    },
    // Expose the internal store for test manipulation
    __testStore: store,
  }
})

import { listWorkflows, loadWorkflow, saveWorkflow, deleteWorkflow } from './workflow-store'
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
  it('strips path traversal characters from id', async () => {
    vi.mocked(fs.promises.writeFile).mockResolvedValueOnce(undefined)

    await saveWorkflow({
      id: 'wf/../../../etc/passwd',
      name: 'Evil',
      nodes: [],
      edges: [],
      createdAt: 1,
      updatedAt: 1,
    })

    // The filename portion should not contain path traversal chars
    const writtenPath = vi.mocked(fs.promises.writeFile).mock.calls[0]?.[0] as string
    const filename = writtenPath.split('/').pop() ?? ''
    expect(filename).not.toContain('..')
    // safeId strips everything except [a-zA-Z0-9_-]
    expect(filename).toBe('wfetcpasswd.json')
  })
})
