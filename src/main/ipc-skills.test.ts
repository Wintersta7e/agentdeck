import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ipcMain } from 'electron'
import { registerSkillHandlers } from './ipc/ipc-skills'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

vi.mock('./skill-scanner', () => ({
  listSkills: vi.fn().mockResolvedValue([
    {
      id: 'global:lint-fix',
      name: 'lint-fix',
      description: 'Fix lint',
      path: '/skills/lint-fix/SKILL.md',
      scope: 'global',
    },
  ]),
}))

vi.mock('./logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

describe('ipc-skills', () => {
  let handler: (event: unknown, opts: unknown) => Promise<unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    registerSkillHandlers()
    const call = vi.mocked(ipcMain.handle).mock.calls[0]
    expect(call?.[0]).toBe('skills:list')
    handler = call![1] as (event: unknown, opts: unknown) => Promise<unknown>
  })

  it('registers skills:list handler', () => {
    expect(ipcMain.handle).toHaveBeenCalledWith('skills:list', expect.any(Function))
  })

  it('returns skills for valid request', async () => {
    const result = await handler(null, { includeGlobal: true })
    expect(result).toHaveLength(1)
  })

  it('accepts empty opts', async () => {
    const result = await handler(null, {})
    expect(result).toBeDefined()
  })

  it('accepts opts with projectPath', async () => {
    const result = await handler(null, { projectPath: '/home/user/project' })
    expect(result).toBeDefined()
  })

  it('rejects projectPath with ..', async () => {
    await expect(handler(null, { projectPath: '/home/../etc/passwd' })).rejects.toThrow(
      'invalid projectPath',
    )
  })

  it('rejects projectPath not starting with /', async () => {
    await expect(handler(null, { projectPath: 'relative/path' })).rejects.toThrow(
      'invalid projectPath',
    )
  })

  it('rejects projectPath over 500 chars', async () => {
    const longPath = '/' + 'a'.repeat(501)
    await expect(handler(null, { projectPath: longPath })).rejects.toThrow('invalid projectPath')
  })

  it('rejects non-object opts', async () => {
    await expect(handler(null, 'bad')).rejects.toThrow('expects an options object')
  })

  it('treats empty string projectPath as undefined', async () => {
    const { listSkills } = await import('./skill-scanner')
    await handler(null, { projectPath: '' })
    expect(listSkills).toHaveBeenCalledWith(expect.objectContaining({ projectPath: undefined }))
  })

  it('rejects projectPath with double-slash (collapses under normalization)', async () => {
    await expect(handler(null, { projectPath: '/home//user' })).rejects.toThrow(
      'invalid projectPath',
    )
  })

  it('accepts projectPath with a trailing slash (preserved by normalization)', async () => {
    const result = await handler(null, { projectPath: '/home/user/project/' })
    expect(result).toBeDefined()
  })
})
