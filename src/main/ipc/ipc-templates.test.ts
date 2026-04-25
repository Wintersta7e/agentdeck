import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Template, TemplateDraft, TemplateScope } from '../../shared/types'
import type { TemplateStore } from '../template-store'
import type { LegacyStoreAdapter } from '../template-legacy-store'

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    },
  },
}))

const { registerTemplateIpc, registerLegacyTemplateIpc } = await import('./ipc-templates')

async function call(channel: string, ...args: unknown[]): Promise<unknown> {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`no handler for ${channel}`)
  return fn(null, ...args)
}

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'tmpl-1',
    name: 'one',
    description: 'd',
    content: 'c',
    usageCount: 0,
    lastUsedAt: 0,
    pinned: false,
    scope: 'user',
    projectId: null,
    path: '/tmp/one.json',
    mtimeMs: 1,
    ...overrides,
  }
}

function makeStore(): {
  store: TemplateStore
  listAll: ReturnType<typeof vi.fn>
  activateProject: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  incrementUsage: ReturnType<typeof vi.fn>
  setPinned: ReturnType<typeof vi.fn>
} {
  const listAll = vi.fn(async () => [] as Template[])
  const activateProject = vi.fn(async () => [] as Template[])
  const save = vi.fn(async (_d: TemplateDraft, _s: TemplateScope) => makeTemplate())
  const del = vi.fn(async () => undefined)
  const incrementUsage = vi.fn(async () => undefined)
  const setPinned = vi.fn(async () => undefined)
  const store: TemplateStore = {
    listAll,
    activateProject,
    save,
    delete: del,
    incrementUsage,
    setPinned,
    onChange: () => (): void => {},
    onParseError: () => (): void => {},
    dispose: () => {},
  }
  return { store, listAll, activateProject, save, delete: del, incrementUsage, setPinned }
}

function makeLegacy(): {
  legacy: LegacyStoreAdapter
  listAll: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  incrementUsage: ReturnType<typeof vi.fn>
  setPinned: ReturnType<typeof vi.fn>
} {
  const listAll = vi.fn(async () => [makeTemplate({ id: 'legacy-1' })])
  const save = vi.fn(async () => makeTemplate({ id: 'legacy-1' }))
  const del = vi.fn(async () => undefined)
  const incrementUsage = vi.fn(async () => undefined)
  const setPinned = vi.fn(async () => undefined)
  const legacy: LegacyStoreAdapter = {
    listAll,
    save,
    delete: del,
    incrementUsage,
    setPinned,
  }
  return { legacy, listAll, save, delete: del, incrementUsage, setPinned }
}

function register(opts: {
  migrationComplete?: boolean
  existingProjects?: Set<string>
}): ReturnType<typeof makeStore> & ReturnType<typeof makeLegacy> {
  const s = makeStore()
  const l = makeLegacy()
  const projects = opts.existingProjects ?? new Set(['proj-1'])
  registerTemplateIpc({
    store: s.store,
    legacy: l.legacy,
    migrationComplete: (): boolean => opts.migrationComplete ?? true,
    getProjectExists: (id) => projects.has(id),
  })
  registerLegacyTemplateIpc({
    store: s.store,
    legacy: l.legacy,
    migrationComplete: (): boolean => opts.migrationComplete ?? true,
  })
  return {
    ...s,
    legacy: l.legacy,
    listAll: s.listAll,
    save: s.save,
    delete: s.delete,
    incrementUsage: s.incrementUsage,
    setPinned: s.setPinned,
  } as unknown as ReturnType<typeof makeStore> & ReturnType<typeof makeLegacy>
}

const validDraft: TemplateDraft = {
  name: 'Hello',
  description: 'desc',
  content: 'body',
}

describe('ipc-templates', () => {
  beforeEach(() => {
    handlers.clear()
  })

  describe('templates:save', () => {
    it('rejects invalid scope', async () => {
      register({ migrationComplete: true })
      await expect(call('templates:save', validDraft, 'bogus', null)).rejects.toThrow(
        /invalid scope/,
      )
    })

    it('rejects project scope with null projectId', async () => {
      register({ migrationComplete: true })
      await expect(call('templates:save', validDraft, 'project', null)).rejects.toThrow(
        /projectId required/,
      )
    })

    it('rejects unknown projectId', async () => {
      register({ migrationComplete: true, existingProjects: new Set<string>() })
      await expect(call('templates:save', validDraft, 'project', 'proj-1')).rejects.toThrow(
        /unknown projectId/,
      )
    })

    it('rejects name too long (>256)', async () => {
      register({ migrationComplete: true })
      const draft: TemplateDraft = { ...validDraft, name: 'x'.repeat(257) }
      await expect(call('templates:save', draft, 'user', null)).rejects.toThrow(/name too long/)
    })

    it('rejects content too long (>100000)', async () => {
      register({ migrationComplete: true })
      const draft: TemplateDraft = { ...validDraft, content: 'x'.repeat(100_001) }
      await expect(call('templates:save', draft, 'user', null)).rejects.toThrow(/content too long/)
    })

    it('happy path — valid draft + user scope calls store.save', async () => {
      const { store } = register({ migrationComplete: true })
      await call('templates:save', validDraft, 'user', null)
      expect(store.save).toHaveBeenCalledTimes(1)
      expect(store.save).toHaveBeenCalledWith(validDraft, 'user', null, undefined)
    })

    it('happy path — project scope with valid projectId', async () => {
      const { store } = register({
        migrationComplete: true,
        existingProjects: new Set(['proj-1']),
      })
      await call('templates:save', validDraft, 'project', 'proj-1')
      expect(store.save).toHaveBeenCalledWith(validDraft, 'project', 'proj-1', undefined)
    })

    it('rejects id too long (>128)', async () => {
      register({ migrationComplete: true })
      // Start from a SAFE_ID_RE-valid prefix, then stretch past the 128-char
      // cap with legal identifier characters so the pattern check passes and
      // the length cap is exercised.
      const draft: TemplateDraft = { ...validDraft, id: 'a'.repeat(129) }
      await expect(call('templates:save', draft, 'user', null)).rejects.toThrow(/id too long/)
    })

    it('rejects projectId too long (>128)', async () => {
      const longProjectId = 'p'.repeat(129)
      register({
        migrationComplete: true,
        existingProjects: new Set([longProjectId]),
      })
      await expect(call('templates:save', validDraft, 'project', longProjectId)).rejects.toThrow(
        /projectId too long/,
      )
    })

    it('rejects category not in TemplateCategory enum', async () => {
      register({ migrationComplete: true })
      const draft = { ...validDraft, category: 'Bogus' } as unknown as TemplateDraft
      await expect(call('templates:save', draft, 'user', null)).rejects.toThrow(
        /valid TemplateCategory/,
      )
    })

    it('accepts a valid TemplateCategory', async () => {
      const { store } = register({ migrationComplete: true })
      const draft: TemplateDraft = { ...validDraft, category: 'Orient' }
      await call('templates:save', draft, 'user', null)
      expect(store.save).toHaveBeenCalledTimes(1)
    })

    it('rejects baseMtime=NaN', async () => {
      register({ migrationComplete: true })
      await expect(call('templates:save', validDraft, 'user', null, Number.NaN)).rejects.toThrow(
        /finite non-negative/,
      )
    })

    it('rejects baseMtime=Infinity', async () => {
      register({ migrationComplete: true })
      await expect(
        call('templates:save', validDraft, 'user', null, Number.POSITIVE_INFINITY),
      ).rejects.toThrow(/finite non-negative/)
    })

    it('rejects baseMtime negative', async () => {
      register({ migrationComplete: true })
      await expect(call('templates:save', validDraft, 'user', null, -1)).rejects.toThrow(
        /finite non-negative/,
      )
    })

    it('rejects baseMtime > MAX_SAFE_INTEGER', async () => {
      register({ migrationComplete: true })
      await expect(
        call('templates:save', validDraft, 'user', null, Number.MAX_SAFE_INTEGER + 2),
      ).rejects.toThrow(/finite non-negative/)
    })
  })

  describe('templates:delete', () => {
    it('rejects invalid ref (bad id)', async () => {
      register({ migrationComplete: true })
      await expect(
        call('templates:delete', { id: 'has spaces', scope: 'user', projectId: null }),
      ).rejects.toThrow(/ref.id must be a valid identifier/)
    })

    it('rejects invalid ref (non-object)', async () => {
      register({ migrationComplete: true })
      await expect(call('templates:delete', 'not-an-object')).rejects.toThrow(
        /ref must be an object/,
      )
    })

    it('happy path', async () => {
      const { store } = register({ migrationComplete: true })
      await call('templates:delete', { id: 'tmpl-1', scope: 'user', projectId: null })
      expect(store.delete).toHaveBeenCalledWith({
        id: 'tmpl-1',
        scope: 'user',
        projectId: null,
      })
    })
  })

  describe('templates:setPinned', () => {
    it('rejects non-boolean pinned (number)', async () => {
      register({ migrationComplete: true })
      await expect(
        call('templates:setPinned', { id: 'tmpl-1', scope: 'user', projectId: null }, 1 as unknown),
      ).rejects.toThrow(/pinned must be a boolean/)
    })

    it('rejects non-boolean pinned (string)', async () => {
      register({ migrationComplete: true })
      await expect(
        call(
          'templates:setPinned',
          { id: 'tmpl-1', scope: 'user', projectId: null },
          'yes' as unknown,
        ),
      ).rejects.toThrow(/pinned must be a boolean/)
    })

    it('happy path', async () => {
      const { store } = register({ migrationComplete: true })
      await call('templates:setPinned', { id: 'tmpl-1', scope: 'user', projectId: null }, true)
      expect(store.setPinned).toHaveBeenCalledWith(
        { id: 'tmpl-1', scope: 'user', projectId: null },
        true,
      )
    })
  })

  describe('templates:incrementUsage', () => {
    it('happy path', async () => {
      const { store } = register({ migrationComplete: true })
      await call('templates:incrementUsage', {
        id: 'tmpl-1',
        scope: 'user',
        projectId: null,
      })
      expect(store.incrementUsage).toHaveBeenCalledWith({
        id: 'tmpl-1',
        scope: 'user',
        projectId: null,
      })
    })
  })

  describe('templates:listAll migration fallback', () => {
    it('routes to legacy adapter when migration incomplete', async () => {
      const { store, legacy } = register({ migrationComplete: false })
      const result = (await call('templates:listAll')) as Template[]
      expect(legacy.listAll).toHaveBeenCalledTimes(1)
      expect(store.listAll).not.toHaveBeenCalled()
      expect(result).toHaveLength(1)
      expect(result[0]?.id).toBe('legacy-1')
    })

    it('routes to store when migration complete', async () => {
      const { store, legacy } = register({ migrationComplete: true })
      await call('templates:listAll')
      expect(store.listAll).toHaveBeenCalledTimes(1)
      expect(legacy.listAll).not.toHaveBeenCalled()
    })
  })

  describe('store:getTemplates compat shim', () => {
    it('routes to legacy when migration incomplete', async () => {
      const { legacy } = register({ migrationComplete: false })
      await call('store:getTemplates')
      expect(legacy.listAll).toHaveBeenCalledTimes(1)
    })

    it('routes to store when migration complete', async () => {
      const { store } = register({ migrationComplete: true })
      await call('store:getTemplates')
      expect(store.listAll).toHaveBeenCalledTimes(1)
    })
  })
})
