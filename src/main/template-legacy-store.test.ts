import { describe, it, expect } from 'vitest'
import type { Template, TemplateFile } from '../shared/types'
import { createLegacyStoreAdapter } from './template-legacy-store'

interface MiniStore {
  get: <T>(key: string) => T
  set: <T>(key: string, value: T) => void
  has: (key: string) => boolean
}

const makeStore = (initial: unknown[] = []): MiniStore => {
  let state = initial
  return {
    get: <T>(key: string): T => {
      if (key === 'templates') return state as T
      return undefined as T
    },
    set: <T>(key: string, v: T): void => {
      if (key === 'templates') state = v as unknown[]
    },
    has: (key: string): boolean => key === 'templates',
  }
}

describe('template-legacy-store', () => {
  it('listAll returns user-scoped templates', async () => {
    const store = makeStore([{ id: 'a', name: 'x', description: '', content: 'y' }])
    const adapter = createLegacyStoreAdapter(store)
    const list: Template[] = await adapter.listAll()
    expect(list).toHaveLength(1)
    const first = list[0]
    expect(first).toBeDefined()
    expect(first?.scope).toBe('user')
    expect(first?.projectId).toBeNull()
    expect(first?.path).toBe('legacy-store:a')
    expect(first?.mtimeMs).toBe(0)
    expect(first?.usageCount).toBe(0)
    expect(first?.pinned).toBe(false)
  })

  it('save persists back to electron-store templates key', async () => {
    const store = makeStore()
    const adapter = createLegacyStoreAdapter(store)
    const file: TemplateFile = {
      id: 'a',
      name: 'x',
      description: '',
      content: 'y',
      usageCount: 0,
      lastUsedAt: 0,
      pinned: false,
    }
    await adapter.save(file)
    expect(store.get<unknown[]>('templates')).toHaveLength(1)
  })
})
