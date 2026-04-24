import { describe, it, expect } from 'vitest'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runTemplateMigration } from './template-migration'

const makeStore = (
  init: Record<string, unknown>,
): {
  has: (k: string) => boolean
  get: <T>(k: string) => T
  set: (k: string, v: unknown) => void
  delete: (k: string) => void
  _state: Record<string, unknown>
} => {
  const state: Record<string, unknown> = { ...init }
  return {
    has: (k) => k in state,
    get: <T>(k: string): T => state[k] as T,
    set: (k, v) => {
      state[k] = v
    },
    delete: (k) => {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- test-only store stub
      delete state[k]
    },
    _state: state,
  }
}

describe('template-migration', () => {
  it('migrates N templates to files and clears the electron-store key', async () => {
    const userRoot = await mkdtemp(join(tmpdir(), 'mig-'))
    const store = makeStore({
      templates: [
        { id: 'a', name: 'A', description: '', content: 'alpha' },
        { id: 'b', name: 'B', description: '', content: 'beta', category: 'Orient' },
      ],
      appPrefs: { templatesMigrated: false },
    })
    const result = await runTemplateMigration({ store, userRoot })
    expect(result.status).toBe('migrated')
    expect(result.count).toBe(2)
    expect(store.has('templates')).toBe(false)
    expect(store.get<{ templatesMigrated: boolean }>('appPrefs')).toEqual(
      expect.objectContaining({ templatesMigrated: true }),
    )

    const files = (await readdir(userRoot)).filter((f) => f.endsWith('.json'))
    expect(files.sort()).toEqual(['a.json', 'b.json'])

    const a = JSON.parse(await readFile(join(userRoot, 'a.json'), 'utf-8')) as {
      usageCount: number
      lastUsedAt: number
      pinned: boolean
    }
    expect(a.usageCount).toBe(0)
    expect(a.lastUsedAt).toBe(0)
    expect(a.pinned).toBe(false)

    await rm(userRoot, { recursive: true, force: true })
  })

  it('fresh install (length=0) seeds directly and flips flag', async () => {
    const userRoot = await mkdtemp(join(tmpdir(), 'mig-fresh-'))
    const store = makeStore({
      templates: [],
      appPrefs: { templatesMigrated: false },
    })
    const result = await runTemplateMigration({
      store,
      userRoot,
      seeds: [{ id: 's', name: 'Seed', description: '', content: '' }],
    })
    expect(result.status).toBe('freshInstallSeeded')
    expect(result.count).toBe(1)
    const files = (await readdir(userRoot)).filter((f) => f.endsWith('.json'))
    expect(files).toEqual(['s.json'])
    expect(store.get<{ templatesMigrated: boolean }>('appPrefs').templatesMigrated).toBe(true)

    await rm(userRoot, { recursive: true, force: true })
  })

  it('already migrated: no-op', async () => {
    const userRoot = await mkdtemp(join(tmpdir(), 'mig-done-'))
    const store = makeStore({ templates: [], appPrefs: { templatesMigrated: true } })
    const result = await runTemplateMigration({ store, userRoot })
    expect(result.status).toBe('skipped')
    expect(result.count).toBe(0)

    await rm(userRoot, { recursive: true, force: true })
  })
})
