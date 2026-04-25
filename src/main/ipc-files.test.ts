import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ipcMain, shell } from 'electron'
import { registerFilesIpc } from './ipc/ipc-files'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  shell: { openPath: vi.fn().mockResolvedValue('') },
}))

vi.mock('./files-lister', () => ({
  listDir: vi.fn().mockResolvedValue({
    entries: [
      { name: 'src', isDir: true },
      { name: 'node_modules', isDir: true },
      { name: 'README.md', isDir: false, size: 42, mtime: 1700000000000 },
    ],
  }),
}))

vi.mock('./files-gitignore', () => ({
  gitignoreCheck: vi.fn().mockResolvedValue(new Set<string>(['node_modules'])),
}))

vi.mock('./wsl-utils', () => ({
  getDefaultDistroAsync: vi.fn().mockResolvedValue('Ubuntu'),
  wslPathToWindows: vi.fn((p: string) => p),
}))

vi.mock('./logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

describe('ipc-files', () => {
  let listDirHandler: (event: unknown, opts: unknown) => Promise<unknown>
  let openExternalHandler: (event: unknown, opts: unknown) => Promise<unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    registerFilesIpc()
    const calls = vi.mocked(ipcMain.handle).mock.calls
    const listCall = calls.find((c) => c[0] === 'files:listDir')
    const openCall = calls.find((c) => c[0] === 'files:openExternal')
    expect(listCall).toBeDefined()
    expect(openCall).toBeDefined()
    listDirHandler = listCall![1] as (e: unknown, o: unknown) => Promise<unknown>
    openExternalHandler = openCall![1] as (e: unknown, o: unknown) => Promise<unknown>
  })

  it('registers both handlers', () => {
    expect(ipcMain.handle).toHaveBeenCalledWith('files:listDir', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('files:openExternal', expect.any(Function))
  })

  it('filters gitignored entries from listDir result', async () => {
    const result = (await listDirHandler(null, {
      path: '/home/u/proj',
      projectPath: '/home/u/proj',
    })) as { entries: Array<{ name: string }>; gitignored: string[] }
    const names = result.entries.map((e) => e.name)
    expect(names).toContain('src')
    expect(names).toContain('README.md')
    expect(names).not.toContain('node_modules')
    expect(result.gitignored).toEqual(['node_modules'])
  })

  it('accepts non-traversal `..` substring in name (foo..bar)', async () => {
    const result = (await listDirHandler(null, {
      path: '/home/u/foo..bar',
      projectPath: '/home/u/foo..bar',
    })) as unknown
    expect(result).toBeDefined()
  })

  it('rejects path traversal segment in listDir', async () => {
    await expect(
      listDirHandler(null, { path: '/home/u/../etc', projectPath: '/home/u' }),
    ).rejects.toThrow('invalid path')
  })

  it('rejects relative path in listDir', async () => {
    await expect(
      listDirHandler(null, { path: 'relative', projectPath: '/home/u' }),
    ).rejects.toThrow('invalid path')
  })

  it('rejects path over 1000 chars', async () => {
    const long = '/' + 'a'.repeat(1001)
    await expect(listDirHandler(null, { path: long, projectPath: '/home/u' })).rejects.toThrow(
      'invalid path',
    )
  })

  it('rejects non-object opts', async () => {
    await expect(listDirHandler(null, 'bad')).rejects.toThrow('expects an options object')
  })

  it('rejects path outside projectPath (scope check)', async () => {
    await expect(
      listDirHandler(null, { path: '/etc/passwd', projectPath: '/home/u/proj' }),
    ).rejects.toThrow('within projectPath')
  })

  it('accepts path equal to projectPath', async () => {
    const result = await listDirHandler(null, {
      path: '/home/u/proj',
      projectPath: '/home/u/proj',
    })
    expect(result).toBeDefined()
  })

  it('accepts path strictly under projectPath', async () => {
    const result = await listDirHandler(null, {
      path: '/home/u/proj/src',
      projectPath: '/home/u/proj',
    })
    expect(result).toBeDefined()
  })

  it('rejects sibling directory disguised as prefix (proj-evil vs proj)', async () => {
    await expect(
      listDirHandler(null, { path: '/home/u/proj-evil', projectPath: '/home/u/proj' }),
    ).rejects.toThrow('within projectPath')
  })

  it('openExternal calls shell.openPath for in-scope file', async () => {
    await openExternalHandler(null, {
      path: '/home/u/proj/README.md',
      projectPath: '/home/u/proj',
    })
    expect(shell.openPath).toHaveBeenCalledTimes(1)
    expect(vi.mocked(shell.openPath).mock.calls[0]?.[0]).toContain('README.md')
  })

  it('openExternal rejects out-of-scope file', async () => {
    await expect(
      openExternalHandler(null, { path: '/etc/passwd', projectPath: '/home/u/proj' }),
    ).rejects.toThrow('within projectPath')
  })

  it('openExternal rejects sibling-prefix file (proj-evil vs proj)', async () => {
    await expect(
      openExternalHandler(null, {
        path: '/home/u/proj-evil/README.md',
        projectPath: '/home/u/proj',
      }),
    ).rejects.toThrow('within projectPath')
  })

  it('openExternal rejects non-object opts', async () => {
    await expect(openExternalHandler(null, '/home/u/proj/x.txt')).rejects.toThrow(
      'expects an options object',
    )
  })
})
