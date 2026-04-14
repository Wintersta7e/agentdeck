import { describe, it, expect, beforeEach, vi } from 'vitest'

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    },
  },
}))

vi.mock('../../workflow-store', () => ({
  listWorkflows: vi.fn(() => Promise.resolve([])),
  loadWorkflow: vi.fn(() => Promise.resolve(null)),
  saveWorkflow: vi.fn(() => Promise.resolve()),
  renameWorkflow: vi.fn(() => Promise.resolve()),
  deleteWorkflow: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../workflow-run-store', () => ({
  listRuns: vi.fn(() => Promise.resolve([])),
  deleteRun: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../wsl-utils', () => ({
  toWslPath: (p: string) => p,
}))

const { registerWorkflowHandlers } = await import('../ipc-workflows')

function call(channel: string, ...args: unknown[]): unknown {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`no handler for ${channel}`)
  return fn(null, ...args)
}

describe('ipc-workflows', () => {
  beforeEach(() => {
    handlers.clear()
    registerWorkflowHandlers(() => null)
  })

  it('workflows:load rejects unsafe ids', () => {
    expect(() => call('workflows:load', '../evil')).toThrow(/workflow/i)
  })

  it('workflows:save accepts new workflows without an id', () => {
    const saveSpy = vi.fn()
    handlers.clear()
    // Re-register so we capture saveWorkflow mock state
    registerWorkflowHandlers(() => null)
    // The concrete call should not throw; the underlying saveWorkflow mock just resolves.
    expect(() => call('workflows:save', { name: 'Fresh', nodes: [], edges: [] })).not.toThrow()
    void saveSpy
  })

  it('workflows:save rejects a present-but-unsafe id at the IPC boundary', () => {
    expect(() => call('workflows:save', { id: '../x', name: 'X', nodes: [], edges: [] })).toThrow(
      /workflow ID/i,
    )
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
})
