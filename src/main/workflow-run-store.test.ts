import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fs and electron before importing module
vi.mock('fs', () => {
  const store = new Map<string, string>()
  const stats = new Map<string, { mtimeMs: number }>()
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
        stats.set(filepath, { mtimeMs: Date.now() })
      }),
      rename: vi.fn(async (src: string, dest: string) => {
        const data = store.get(src)
        if (data === undefined) {
          const err = new Error(`ENOENT: no such file`) as NodeJS.ErrnoException
          err.code = 'ENOENT'
          throw err
        }
        const srcStat = stats.get(src)
        store.delete(src)
        stats.delete(src)
        store.set(dest, data)
        stats.set(dest, srcStat ?? { mtimeMs: Date.now() })
      }),
      rm: vi.fn(async (filepath: string) => {
        store.delete(filepath)
        stats.delete(filepath)
      }),
      stat: vi.fn(async (filepath: string) => {
        const s = stats.get(filepath)
        if (!s) {
          const err = new Error(`ENOENT: no such file`) as NodeJS.ErrnoException
          err.code = 'ENOENT'
          throw err
        }
        return s
      }),
    },
    __testStore: store,
    __testStats: stats,
  }
})

import { saveRun, listRuns, deleteRun } from './workflow-run-store'
import type { WorkflowRun } from '../shared/types'
import * as fs from 'fs'

const testStore = (fs as unknown as { __testStore: Map<string, string> }).__testStore
const testStats = (fs as unknown as { __testStats: Map<string, { mtimeMs: number }> }).__testStats

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 'run-1',
    workflowId: 'wf-abc',
    workflowName: 'Test Workflow',
    status: 'done',
    startedAt: 1000,
    finishedAt: 2000,
    durationMs: 1000,
    projectPath: null,
    variables: {},
    nodes: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  testStore.clear()
  testStats.clear()
})

describe('saveRun', () => {
  it('writes a file and it can be read back via listRuns', async () => {
    const run = makeRun()
    await saveRun(run)

    const runs = await listRuns('wf-abc')
    expect(runs).toHaveLength(1)
    expect(runs[0]?.id).toBe('run-1')
    expect(runs[0]?.workflowName).toBe('Test Workflow')
  })

  it('prunes beyond 20 runs', async () => {
    // Save 22 runs with different timestamps
    for (let i = 0; i < 22; i++) {
      const run = makeRun({
        id: `run-${i}`,
        startedAt: 1000 + i,
      })
      await saveRun(run)
    }

    // Count remaining files for this workflow
    const remainingFiles = [...testStore.keys()].filter((k) => {
      const basename = k.split('/').pop() ?? ''
      return basename.startsWith('wf-abc_') && basename.endsWith('.json')
    })
    expect(remainingFiles.length).toBe(20)
  })
})

describe('listRuns', () => {
  it('returns empty array for unknown workflow', async () => {
    const runs = await listRuns('nonexistent')
    expect(runs).toEqual([])
  })

  it('sorts newest first', async () => {
    const run1 = makeRun({ id: 'run-old', startedAt: 1000 })
    const run2 = makeRun({ id: 'run-mid', startedAt: 2000 })
    const run3 = makeRun({ id: 'run-new', startedAt: 3000 })

    // Save in non-chronological order
    await saveRun(run2)
    await saveRun(run1)
    await saveRun(run3)

    const runs = await listRuns('wf-abc')
    expect(runs).toHaveLength(3)
    expect(runs[0]?.id).toBe('run-new')
    expect(runs[1]?.id).toBe('run-mid')
    expect(runs[2]?.id).toBe('run-old')
  })

  it('skips malformed JSON files', async () => {
    // Save a valid run first
    await saveRun(makeRun({ id: 'run-valid', startedAt: 1000 }))

    // Inject a malformed file directly into the store
    const badPath = '/tmp/mock-electron/userData/workflow-runs/wf-abc_9999.json'
    testStore.set(badPath, 'not valid json{{{')
    testStats.set(badPath, { mtimeMs: 9999 })

    const runs = await listRuns('wf-abc')
    expect(runs).toHaveLength(1)
    expect(runs[0]?.id).toBe('run-valid')
  })

  it('does not return runs from other workflows', async () => {
    await saveRun(makeRun({ id: 'run-a', workflowId: 'wf-abc', startedAt: 1000 }))
    await saveRun(makeRun({ id: 'run-b', workflowId: 'wf-other', startedAt: 2000 }))

    const runs = await listRuns('wf-abc')
    expect(runs).toHaveLength(1)
    expect(runs[0]?.id).toBe('run-a')
  })
})

describe('deleteRun', () => {
  it('removes the correct file', async () => {
    await saveRun(makeRun({ id: 'run-keep', startedAt: 1000 }))
    await saveRun(makeRun({ id: 'run-delete', startedAt: 2000 }))

    await deleteRun('run-delete')

    const runs = await listRuns('wf-abc')
    expect(runs).toHaveLength(1)
    expect(runs[0]?.id).toBe('run-keep')
  })

  it('is a no-op for unknown run ID', async () => {
    await saveRun(makeRun({ id: 'run-1', startedAt: 1000 }))

    // Should not throw
    await deleteRun('nonexistent-run')

    const runs = await listRuns('wf-abc')
    expect(runs).toHaveLength(1)
  })
})

describe('safeId validation', () => {
  it('rejects workflowId with path traversal in listRuns', async () => {
    await expect(listRuns('../etc/passwd')).rejects.toThrow(/Invalid id/)
  })

  it('rejects workflowId with path traversal in saveRun', async () => {
    const run = makeRun({ workflowId: '../evil' })
    await expect(saveRun(run)).rejects.toThrow(/Invalid id/)
  })

  it('rejects runId with path traversal in deleteRun', async () => {
    await expect(deleteRun('../evil')).rejects.toThrow(/Invalid id/)
  })
})
