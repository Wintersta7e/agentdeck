import { describe, it, expect, beforeEach, vi } from 'vitest'

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    },
  },
  BrowserWindow: vi.fn(),
}))

vi.mock('../logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))

vi.mock('../detect-stack', () => ({
  detectStack: vi.fn(() => Promise.resolve({ languages: [], frameworks: [], tools: [] })),
}))

vi.mock('../skill-scanner', () => ({
  listSkills: vi.fn(() => Promise.resolve([])),
}))

vi.mock('../wsl-utils', () => ({
  wslPathToWindows: (p: string) => p,
  getDefaultDistroAsync: () => Promise.resolve('Ubuntu'),
  withUncFallback: async <T>(_p: string, fn: (p: string) => Promise<T>): Promise<T> => fn(_p),
}))

const { registerProjectHandlers } = await import('./ipc-projects')

function call(channel: string, ...args: unknown[]): unknown {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`no handler for ${channel}`)
  return fn(null, ...args)
}

describe('ipc-projects', () => {
  beforeEach(() => {
    handlers.clear()
    registerProjectHandlers(() => null)
  })

  it('projects:readFile rejects empty projectPath', async () => {
    await expect(call('projects:readFile', '', 'CLAUDE.md') as Promise<unknown>).rejects.toThrow(
      /projectPath/,
    )
  })

  it('projects:readFile rejects path with traversal (../)', async () => {
    await expect(
      call('projects:readFile', '/home/../etc', 'CLAUDE.md') as Promise<unknown>,
    ).rejects.toThrow(/traversal/)
  })

  it('projects:readFile rejects path with backslash traversal', async () => {
    await expect(
      call('projects:readFile', 'C:\\home\\..\\secret', 'CLAUDE.md') as Promise<unknown>,
    ).rejects.toThrow(/traversal/)
  })

  it('projects:readFile rejects filenames outside the allowlist', async () => {
    await expect(
      call('projects:readFile', '/home/user/project', 'passwd') as Promise<unknown>,
    ).rejects.toThrow(/permitted/)
  })

  it('projects:readFile rejects non-string filename', async () => {
    await expect(
      call('projects:readFile', '/home/user/project', '') as Promise<unknown>,
    ).rejects.toThrow(/filename/)
  })
})
