import type { LegacyTemplate, Template, TemplateFile } from '../shared/types'

export interface LegacyStoreAdapter {
  listAll: () => Promise<Template[]>
  save: (file: TemplateFile) => Promise<Template>
  delete: (id: string) => Promise<void>
  incrementUsage: (id: string) => Promise<void>
  setPinned: (id: string, pinned: boolean) => Promise<void>
}

interface Store {
  /** Returns unknown: the legacy store is untyped JSON on disk. */
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
  has: (key: string) => boolean
}

function readTemplates(store: Store): LegacyTemplate[] {
  return (store.get('templates') as LegacyTemplate[] | undefined) ?? []
}

function toTemplate(l: LegacyTemplate, extras: Partial<TemplateFile>): Template {
  return {
    id: l.id,
    name: l.name,
    description: l.description,
    content: l.content ?? '',
    category: l.category,
    usageCount: extras.usageCount ?? 0,
    lastUsedAt: extras.lastUsedAt ?? 0,
    pinned: extras.pinned ?? false,
    scope: 'user',
    projectId: null,
    path: `legacy-store:${l.id}`,
    mtimeMs: 0,
  }
}

// Nothing here awaits: the legacy store is synchronous. The methods still
// return promises because LegacyStoreAdapter is the async interface the
// template IPC layer talks to.
export function createLegacyStoreAdapter(store: Store): LegacyStoreAdapter {
  return {
    listAll: () => Promise.resolve(readTemplates(store).map((l) => toTemplate(l, {}))),
    save: (file) => {
      const raw = readTemplates(store)
      const idx = raw.findIndex((t) => t.id === file.id)
      const legacy: LegacyTemplate = {
        id: file.id,
        name: file.name,
        description: file.description,
        content: file.content,
        ...(file.category !== undefined ? { category: file.category } : {}),
      }
      if (idx >= 0) raw[idx] = legacy
      else raw.push(legacy)
      store.set('templates', raw)
      return Promise.resolve(toTemplate(legacy, file))
    },
    delete: (id) => {
      store.set(
        'templates',
        readTemplates(store).filter((t) => t.id !== id),
      )
      return Promise.resolve()
    },
    /* usage counts aren't persisted by the legacy store */
    incrementUsage: (_id) => Promise.resolve(),
    /* pinning not persisted by the legacy store */
    setPinned: (_id, _pinned) => Promise.resolve(),
  }
}
