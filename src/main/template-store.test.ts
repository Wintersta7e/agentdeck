import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { mkdtemp, writeFile, readdir, stat, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createTemplateStore, type TemplateChangeEvent } from './template-store'

describe('template-store — user scope', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tmpl-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('scans existing files on bootstrap', async () => {
    await writeFile(
      join(dir, 'a.json'),
      JSON.stringify({
        id: 'a',
        name: 'X',
        description: '',
        content: '',
        usageCount: 0,
        lastUsedAt: 0,
        pinned: false,
      }),
    )
    const store = await createTemplateStore({ userRoot: dir, getProjectPath: () => null })
    const all = await store.listAll()
    expect(all).toHaveLength(1)
    const first = all[0]
    expect(first).toBeDefined()
    expect(first?.id).toBe('a')
    expect(first?.scope).toBe('user')
    expect(first?.path).toBe(join(dir, 'a.json'))
    expect(first?.mtimeMs ?? 0).toBeGreaterThan(0)
  })

  it('save writes a file and re-listAll returns it', async () => {
    const store = await createTemplateStore({ userRoot: dir, getProjectPath: () => null })
    await store.save({ name: 'Y', description: '', content: '' }, 'user', null)
    const files = await readdir(dir)
    expect(files.filter((f) => f.endsWith('.json'))).toHaveLength(1)
    const all = await store.listAll()
    expect(all).toHaveLength(1)
    expect(all[0]?.name).toBe('Y')
  })

  it('save with baseMtime=stale returns E_TEMPLATE_STALE', async () => {
    const store = await createTemplateStore({ userRoot: dir, getProjectPath: () => null })
    const saved = await store.save({ name: 'Y', description: '', content: '' }, 'user', null)
    // Wait a ms so mtime bumps are observable, then externally rewrite the file.
    await new Promise((r) => setTimeout(r, 10))
    await writeFile(saved.path, JSON.stringify({ ...saved, content: 'changed' }))
    const newStat = await stat(saved.path)
    expect(newStat.mtimeMs).toBeGreaterThan(saved.mtimeMs)
    // Attempt to save with the old baseMtime → reject.
    await expect(
      store.save(
        { id: saved.id, name: 'Z', description: '', content: '' },
        'user',
        null,
        saved.mtimeMs,
      ),
    ).rejects.toMatchObject({ code: 'E_TEMPLATE_STALE' })
  })

  it('cross-scope id collision rejects with E_TEMPLATE_ID_EXISTS', async () => {
    const store = await createTemplateStore({
      userRoot: dir,
      getProjectPath: () => null,
    })
    await store.save({ id: 'shared', name: 'A', description: '', content: '' }, 'user', null)
    // Attempt to save same id at 'project' scope — should reject.
    await expect(
      store.save({ id: 'shared', name: 'B', description: '', content: '' }, 'project', 'p1'),
    ).rejects.toMatchObject({ code: 'E_TEMPLATE_ID_EXISTS' })
  })

  it('parseErrorListeners fires on malformed file during activateProject', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'proj-'))
    await fs.mkdir(join(projectDir, '.agentdeck', 'templates'), { recursive: true })
    await writeFile(join(projectDir, '.agentdeck', 'templates', 'bad.json'), '{ not json')

    const store = await createTemplateStore({
      userRoot: dir,
      getProjectPath: () => projectDir,
    })
    const errors: { path: string; error: string }[] = []
    store.onParseError((e) => errors.push(e))
    await store.activateProject('p1')
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]?.path).toContain('bad.json')
    await rm(projectDir, { recursive: true, force: true })
  })
})

describe('template-store — watcher', () => {
  it('emits add event when a file is written out-of-band', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tmpl-watch-'))
    const store = await createTemplateStore({ userRoot: dir, getProjectPath: () => null })
    const events: TemplateChangeEvent[] = []
    store.onChange((e) => events.push(e))

    // Allow the watcher to settle on the empty dir before first write.
    await new Promise((r) => setTimeout(r, 50))

    const path = join(dir, 'ext.json')
    await writeFile(
      path,
      JSON.stringify({
        id: 'ext',
        name: 'E',
        description: '',
        content: '',
        usageCount: 0,
        lastUsedAt: 0,
        pinned: false,
      }),
    )

    // Debounce is 200ms + scan time. Poll up to 3s for the event.
    const deadline = Date.now() + 3000
    while (Date.now() < deadline) {
      if (events.some((e) => e.kind === 'add' && e.template.id === 'ext')) break
      await new Promise((r) => setTimeout(r, 50))
    }

    expect(events.some((e) => e.kind === 'add' && e.template.id === 'ext')).toBe(true)

    store.dispose()
    await rm(dir, { recursive: true, force: true })
  }, 10_000)
})
