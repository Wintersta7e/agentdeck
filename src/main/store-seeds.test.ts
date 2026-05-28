import { describe, it, expect, vi } from 'vitest'
import type { Role } from '../shared/types'
import type { AppStore, StoreSchema } from './project-store'

// store-seeds imports createLogger which uses electron app.getPath
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/mock-electron'),
  },
}))

vi.mock('fs', () => ({
  unlinkSync: vi.fn(),
}))

function makeMockStore(
  roles: Role[] = [],
  prefs: Partial<StoreSchema['appPrefs']> = {},
): { store: AppStore; setSpy: ReturnType<typeof vi.fn> } {
  const data = new Map<string, unknown>()
  data.set('roles', roles)
  data.set('appPrefs', { zoomFactor: 1.0, theme: '', ...prefs })
  const setSpy = vi.fn((key: string, val: unknown): void => {
    data.set(key, JSON.parse(JSON.stringify(val)))
  })
  const store = {
    get: vi.fn((key: string) => JSON.parse(JSON.stringify(data.get(key)))),
    set: setSpy,
  } as unknown as AppStore
  return { store, setSpy }
}

describe('seed roles', () => {
  it('includes the Adversarial Reviewer builtin role', async () => {
    const { seedRoles } = await import('./store-seeds')
    const { store, setSpy } = makeMockStore()
    seedRoles(store)

    const setCall = setSpy.mock.calls.find((c) => c[0] === 'roles')
    const roles = setCall?.[1] as Role[]
    const role = roles?.find((r) => r.name === 'Adversarial Reviewer')
    expect(role).toBeDefined()
    expect(role!.builtin).toBe(true)
    expect(role!.persona.length).toBeGreaterThan(0)
  })
})
