import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Project, LegacyTemplate as Template, Role, EnvVar } from '../shared/types'
import type { StoreSchema, AppStore } from './project-store'

// Mock electron
vi.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    app: {
      getPath: vi.fn(() => '/tmp/mock-electron'),
    },
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      }),
      __handlers: handlers,
    },
    safeStorage: {
      isEncryptionAvailable: vi.fn(() => true),
      encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
      decryptString: vi.fn((b: Buffer) => b.toString().replace(/^enc:/, '')),
    },
  }
})

// Mock fs for store initialization
vi.mock('fs', () => ({
  unlinkSync: vi.fn(),
}))

// Mock electron-store with in-memory map (must use class for `new Store()`)
vi.mock('electron-store', () => {
  class MockStore {
    private data = new Map<string, unknown>()
    constructor({ defaults }: { defaults: StoreSchema }) {
      for (const [key, val] of Object.entries(defaults)) {
        this.data.set(key, JSON.parse(JSON.stringify(val)))
      }
    }
    get(key: string): unknown {
      return JSON.parse(JSON.stringify(this.data.get(key)))
    }
    set(key: string, val: unknown): void {
      this.data.set(key, JSON.parse(JSON.stringify(val)))
    }
  }
  return { default: MockStore }
})

import { createProjectStore } from './project-store'
import { seedTemplates, seedRoles } from './store-seeds'
import { ipcMain, safeStorage } from 'electron'

const handlers = (
  ipcMain as unknown as { __handlers: Map<string, (...args: unknown[]) => unknown> }
).__handlers

async function callHandler(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`No handler for ${channel}`)
  // First arg is the IPC event object (unused), rest are actual args
  return await handler({}, ...args)
}

beforeEach(() => {
  vi.clearAllMocks()
  handlers.clear()
})

describe('createProjectStore', () => {
  it('registers IPC handlers', () => {
    createProjectStore()
    expect(ipcMain.handle).toHaveBeenCalledWith('store:getProjects', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('store:saveProject', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('store:deleteProject', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('store:getTemplates', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('store:saveTemplate', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('store:deleteTemplate', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('store:getRoles', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('store:saveRole', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('store:deleteRole', expect.any(Function))
  })

  it('returns empty projects list initially', async () => {
    createProjectStore()
    const projects = await callHandler('store:getProjects')
    expect(projects).toEqual([])
  })

  it('saves and retrieves a project', async () => {
    createProjectStore()
    const project: Partial<Project> = { name: 'Test', path: '/home/test' }
    const saved = (await callHandler('store:saveProject', project)) as Project
    expect(saved.id).toBeTruthy()
    expect(saved.name).toBe('Test')

    const projects = (await callHandler('store:getProjects')) as Project[]
    expect(projects).toHaveLength(1)
    expect(projects[0]?.name).toBe('Test')
  })

  it('updates an existing project', async () => {
    createProjectStore()
    const saved = (await callHandler('store:saveProject', {
      name: 'Original',
      path: '/home/test',
    })) as Project
    await callHandler('store:saveProject', { id: saved.id, name: 'Updated', path: '/home/test' })

    const projects = (await callHandler('store:getProjects')) as Project[]
    expect(projects).toHaveLength(1)
    expect(projects[0]?.name).toBe('Updated')
  })

  it('deletes a project', async () => {
    createProjectStore()
    const saved = (await callHandler('store:saveProject', {
      name: 'ToDelete',
      path: '/tmp',
    })) as Project
    await callHandler('store:deleteProject', saved.id)

    const projects = (await callHandler('store:getProjects')) as Project[]
    expect(projects).toHaveLength(0)
  })

  it('rejects null project on save', async () => {
    createProjectStore()
    await expect(callHandler('store:saveProject', null)).rejects.toThrow('non-null object')
  })

  it('encrypts secret env vars on save', async () => {
    createProjectStore()
    const envVars: EnvVar[] = [
      { id: 'e1', key: 'API_KEY', value: 'secret123', secret: true },
      { id: 'e2', key: 'DEBUG', value: 'true', secret: false },
    ]
    await callHandler('store:saveProject', { name: 'With Env', path: '/tmp', envVars })

    expect(safeStorage.encryptString).toHaveBeenCalledWith('secret123')
  })

  it('decrypts secret env vars on read', async () => {
    createProjectStore()
    const envVars: EnvVar[] = [{ id: 'e1', key: 'API_KEY', value: 'secret123', secret: true }]
    await callHandler('store:saveProject', { name: 'With Env', path: '/tmp', envVars })

    const projects = (await callHandler('store:getProjects')) as Project[]
    // decryptString should have been called during read
    expect(safeStorage.decryptString).toHaveBeenCalled()
    // The value should come back decrypted
    expect(projects[0]?.envVars?.[0]?.key).toBe('API_KEY')
    expect(projects[0]?.envVars?.[0]?.value).toBe('secret123')
  })

  it('handles encryption unavailable gracefully', async () => {
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)
    createProjectStore()
    const envVars: EnvVar[] = [{ id: 'e1', key: 'KEY', value: 'plain', secret: true }]
    await callHandler('store:saveProject', { name: 'No Enc', path: '/tmp', envVars })

    // Should not encrypt when unavailable
    expect(safeStorage.encryptString).not.toHaveBeenCalled()
  })

  it('auto-migrates legacy single-agent project to agents[] on load', async () => {
    createProjectStore()
    // Save a project with legacy agent field (bypass migration by saving with agents undefined)
    const saved = (await callHandler('store:saveProject', {
      name: 'Legacy',
      path: '/home/legacy',
      agent: 'goose',
      agentFlags: '--verbose',
    })) as Project

    // Reading back should trigger migration
    const projects = (await callHandler('store:getProjects')) as Project[]
    const migrated = projects.find((p) => p.id === saved.id)
    expect(migrated).toBeDefined()
    expect(migrated?.agents).toEqual([{ agent: 'goose', agentFlags: '--verbose', isDefault: true }])
    // Legacy fields should be cleaned up
    expect(migrated?.agent).toBeUndefined()
    expect(migrated?.agentFlags).toBeUndefined()
  })

  it('does not re-migrate projects that already have agents[]', async () => {
    createProjectStore()
    const saved = (await callHandler('store:saveProject', {
      name: 'Modern',
      path: '/home/modern',
      agents: [{ agent: 'claude-code', isDefault: true }, { agent: 'aider' }],
    })) as Project

    const projects = (await callHandler('store:getProjects')) as Project[]
    const project = projects.find((p) => p.id === saved.id)
    expect(project?.agents).toHaveLength(2)
    expect(project?.agents?.[0]?.agent).toBe('claude-code')
    expect(project?.agents?.[1]?.agent).toBe('aider')
  })
})

describe('seedTemplates', () => {
  function makeMockStore(
    templates: Template[] = [],
    prefs: Partial<StoreSchema['appPrefs']> = {},
  ): { store: AppStore; setSpy: ReturnType<typeof vi.fn<(key: string, val: unknown) => void>> } {
    const data = new Map<string, unknown>()
    data.set('templates', templates)
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

  it('seeds 16 templates on fresh install', () => {
    const { store, setSpy } = makeMockStore()
    seedTemplates(store)

    const setCall = setSpy.mock.calls.find((c) => c[0] === 'templates')
    expect(setCall).toBeDefined()
    const templates = setCall?.[1] as Template[]
    expect(templates).toHaveLength(16)
    expect(templates.every((t) => t.id.startsWith('seed-'))).toBe(true)
  })

  it('preserves user templates on upgrade', () => {
    const userTemplate: Template = {
      id: 'user-custom-1',
      name: 'My Template',
      description: 'Custom',
    }
    const seedTemplate: Template = {
      id: 'seed-old-1',
      name: 'Old Seed',
      description: 'Outdated',
    }
    const { store, setSpy } = makeMockStore([seedTemplate, userTemplate], { seedVersion: 1 })
    seedTemplates(store)

    const setCall = setSpy.mock.calls.find((c) => c[0] === 'templates')
    const templates = setCall?.[1] as Template[]
    // Should have 16 new seeds + 1 user template
    expect(templates).toHaveLength(17)
    expect(templates.some((t) => t.id === 'user-custom-1')).toBe(true)
    // Old seed should be replaced
    expect(templates.some((t) => t.id === 'seed-old-1')).toBe(false)
  })

  it('skips seeding when version is current', () => {
    const { store, setSpy } = makeMockStore([], { seedVersion: 2 })
    seedTemplates(store)
    // Should not set templates if version is already current
    expect(setSpy.mock.calls.filter((c) => c[0] === 'templates')).toHaveLength(0)
  })
})

describe('seedRoles', () => {
  function makeMockStore(
    roles: Role[] = [],
    prefs: Partial<StoreSchema['appPrefs']> = {},
  ): { store: AppStore; setSpy: ReturnType<typeof vi.fn<(key: string, val: unknown) => void>> } {
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

  it('seeds 8 built-in roles on fresh install', () => {
    const { store, setSpy } = makeMockStore()
    seedRoles(store)

    const setCall = setSpy.mock.calls.find((c) => c[0] === 'roles')
    const roles = setCall?.[1] as Role[]
    expect(roles).toHaveLength(8)
    expect(roles.every((r) => r.id.startsWith('seed-role-'))).toBe(true)
    expect(roles.every((r) => r.builtin)).toBe(true)
  })

  it('preserves user roles on upgrade', () => {
    const userRole: Role = {
      id: 'custom-role-1',
      name: 'Custom',
      icon: '🎯',
      persona: 'Custom persona',
      builtin: false,
    }
    const { store, setSpy } = makeMockStore([
      { ...userRole },
      { id: 'seed-role-old', name: 'Old', icon: '📋', persona: 'old', builtin: true },
    ])
    seedRoles(store)

    const setCall = setSpy.mock.calls.find((c) => c[0] === 'roles')
    const roles = setCall?.[1] as Role[]
    // 8 new seeds + 1 user role
    expect(roles).toHaveLength(9)
    expect(roles.some((r) => r.id === 'custom-role-1')).toBe(true)
  })
})
