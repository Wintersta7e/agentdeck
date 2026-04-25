import type { LegacyTemplate, Template, TemplateFile } from '../shared/types'

export interface LegacyStoreAdapter {
  listAll: () => Promise<Template[]>
  save: (file: TemplateFile) => Promise<Template>
  delete: (id: string) => Promise<void>
  incrementUsage: (id: string) => Promise<void>
  setPinned: (id: string, pinned: boolean) => Promise<void>
}

interface Store {
  get: <T>(key: string) => T
  set: <T>(key: string, value: T) => void
  has: (key: string) => boolean
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

export function createLegacyStoreAdapter(store: Store): LegacyStoreAdapter {
  return {
    listAll: async () => {
      const raw = store.get<LegacyTemplate[] | undefined>('templates') ?? []
      return raw.map((l) => toTemplate(l, {}))
    },
    save: async (file) => {
      const raw = store.get<LegacyTemplate[] | undefined>('templates') ?? []
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
      return toTemplate(legacy, file)
    },
    delete: async (id) => {
      const raw = store.get<LegacyTemplate[] | undefined>('templates') ?? []
      store.set(
        'templates',
        raw.filter((t) => t.id !== id),
      )
    },
    incrementUsage: async (_id) => {
      /* usage counts aren't persisted by the legacy store */
    },
    setPinned: async (_id, _pinned) => {
      /* pinning not persisted by the legacy store */
    },
  }
}
