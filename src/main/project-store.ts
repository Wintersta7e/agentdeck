import Store from 'electron-store'
import { app, ipcMain, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { posix as posixPath } from 'path'
import { randomUUID } from 'crypto'
import type { EnvVar, Project, Role, Template } from '../shared/types'
import { migrateProjectAgents } from '../shared/agent-helpers'
import { createLogger } from './logger'

const log = createLogger('project-store')

// REL-2: Promise-based write lock prevents concurrent read-modify-write races.
// All mutating handlers (save/delete for projects, templates, roles) are serialized
// through this lock so a second IPC call waits for the first to finish writing.
let writeLock = Promise.resolve()
function serialized<T>(fn: () => T): Promise<T> {
  const p = writeLock.then(fn)
  writeLock = p.then(
    () => {},
    () => {},
  )
  return p
}

function encryptEnvVars(envVars: EnvVar[] | undefined): EnvVar[] | undefined {
  if (!envVars) return envVars
  if (!safeStorage.isEncryptionAvailable()) {
    log.warn('Encryption unavailable — secret env vars stored as plaintext')
    return envVars
  }
  return envVars.map((v) => {
    if (!v.secret) return v
    // Throw on encryption failure to prevent storing plaintext secrets on disk.
    // A silent fallback causes data loss: next load tries to decrypt plaintext → empty string.
    const encrypted = safeStorage.encryptString(v.value).toString('base64')
    return { ...v, value: encrypted }
  })
}

function decryptEnvVars(envVars: EnvVar[] | undefined): EnvVar[] | undefined {
  if (!envVars) return envVars
  if (!safeStorage.isEncryptionAvailable()) return envVars
  return envVars.map((v) => {
    if (!v.secret) return v
    try {
      return { ...v, value: safeStorage.decryptString(Buffer.from(v.value, 'base64')) }
    } catch (err) {
      // C3: Preserve the raw encrypted value and flag the failure so the UI can warn.
      // Returning '' would cause re-encryption of empty string on next save → permanent data loss.
      log.error(`Failed to decrypt env var "${v.key}" — preserving raw value`, { err: String(err) })
      return { ...v, _decryptFailed: true }
    }
  })
}

export interface OfficeWindowStateSchema {
  bounds?: { x: number; y: number; width: number; height: number } | undefined
  maximized?: boolean | undefined
}

export interface StoreSchema {
  projects: Project[]
  templates: Template[]
  roles: Role[]
  officeWindowState?: OfficeWindowStateSchema | undefined
  appPrefs: {
    zoomFactor: number
    zoomAutoDetected?: boolean | number
    theme?: string
    visibleAgents?: string[]
    seeded?: boolean
    seedVersion?: number
    sidebarOpen?: boolean | undefined
    sidebarWidth?: number | undefined
    sidebarSections?: Record<string, boolean> | undefined
    rightPanelWidth?: number | undefined
    wfLogPanelWidth?: number | undefined
    rolesSeedVersion?: number | undefined
    workflowSeedVersion?: number | undefined
    workflowLastRolesVersion?: number | undefined
    officeEnabled?: boolean | undefined
  }
}

export type AppStore = Store<StoreSchema>

/** Returns true unless officeEnabled is explicitly false. Default: true. */
export function isOfficeEnabled(store: AppStore): boolean {
  const prefs = store.get('appPrefs')
  return prefs?.officeEnabled !== false
}

/**
 * Canonicalize a project path for storage and comparison.
 * POSIX-only normalization — consistent with AgentDeck's WSL-paths-only invariant.
 */
export function normalizeProjectPath(rawPath: string): string {
  const trimmed = rawPath.trim()
  if (trimmed === '') return ''
  const normalized = posixPath.normalize(trimmed)
  if (normalized === '/') return '/'
  return normalized.replace(/\/+$/, '') || '/'
}

/**
 * Find a project by its path (after normalization).
 * Returns the first matching project or null.
 */
export function getProjectByPath(store: Store<StoreSchema>, rawPath: string): Project | null {
  const normalized = normalizeProjectPath(rawPath)
  if (normalized === '') return null
  const projects = store.get('projects') ?? []
  for (const p of projects) {
    if (normalizeProjectPath(p.path) === normalized) return p
  }
  return null
}

export function createProjectStore(): Store<StoreSchema> {
  const defaults: StoreSchema = {
    projects: [],
    templates: [],
    roles: [],
    appPrefs: { zoomFactor: 1.0, theme: '' },
  }

  let store: Store<StoreSchema>
  try {
    store = new Store<StoreSchema>({ defaults })
  } catch (err) {
    log.error('Store corrupted, deleting and recreating with defaults', { err: String(err) })
    try {
      const storePath = path.join(app.getPath('userData'), 'config.json')
      fs.unlinkSync(storePath)
    } catch (deleteErr) {
      log.warn('Failed to delete corrupt store file', { err: String(deleteErr) })
    }
    store = new Store<StoreSchema>({ defaults })
  }

  // One-time migration: fix project names that were set to the raw path
  const migrationProjects = store.get('projects')
  let migrated = false
  for (const p of migrationProjects) {
    if (p.name === p.path || p.name.includes('\\') || p.name.includes('/')) {
      p.name =
        p.path
          .replace(/[/\\]+$/, '')
          .split(/[/\\]/)
          .pop() ?? p.name
      migrated = true
    }
  }
  if (migrated) {
    store.set('projects', migrationProjects)
    log.info('Ran project name migration')
  }

  // One-time migration: normalize all stored project paths
  const pathMigrationProjects = store.get('projects')
  let pathMigrated = false
  for (const p of pathMigrationProjects) {
    const normalized = normalizeProjectPath(p.path)
    if (normalized !== p.path) {
      p.path = normalized
      pathMigrated = true
    }
  }
  if (pathMigrated) {
    store.set('projects', pathMigrationProjects)
    log.info('Normalized project paths on startup')
  }

  ipcMain.handle('store:getProjects', () => {
    const projects = store.get('projects')

    // Auto-migrate legacy single-agent projects to agents[] array
    let agentsMigrated = false
    const updated = projects.map((p: Project) => {
      const m = migrateProjectAgents(p)
      if (m !== p) agentsMigrated = true
      return m
    })
    if (agentsMigrated) {
      // env vars are already encrypted on disk — write back as-is
      store.set('projects', updated)
    }

    return updated.map((p) => ({ ...p, envVars: decryptEnvVars(p.envVars) }))
  })

  ipcMain.handle('store:saveProject', (_, project: unknown) => {
    if (!project || typeof project !== 'object') {
      throw new Error('store:saveProject requires a non-null object')
    }
    // Validate required fields from renderer input before trusting the shape
    const raw = project as Record<string, unknown>
    if (raw.id !== undefined && typeof raw.id !== 'string')
      throw new Error('store:saveProject — id must be a string')
    if (raw.name !== undefined && typeof raw.name !== 'string')
      throw new Error('store:saveProject — name must be a string')
    if (raw.path !== undefined && typeof raw.path !== 'string')
      throw new Error('store:saveProject — path must be a string')
    if (typeof raw.name === 'string' && raw.name.length > 200)
      throw new Error('store:saveProject — name too long')
    if (typeof raw.path === 'string' && raw.path.length > 1024)
      throw new Error('store:saveProject — path too long')
    if (Array.isArray(raw.envVars)) {
      if (raw.envVars.length > 100) throw new Error('Too many environment variables (max 100)')
      for (const ev of raw.envVars as { key?: unknown; value?: unknown }[]) {
        if (typeof ev.key !== 'string') throw new Error('Env var key must be a string')
        if (typeof ev.value !== 'string') throw new Error('Env var value must be a string')
        if (ev.key.length > 256) throw new Error('Env var key too long (max 256)')
        if (ev.value.length > 65536) throw new Error('Env var value too long (max 64KB)')
      }
    }
    return serialized(() => {
      const p = project as Partial<Project>
      const projects = store.get('projects')
      const id = p.id ?? randomUUID()
      const withId = { ...p, id, envVars: encryptEnvVars(p.envVars) } as Project
      const idx = projects.findIndex((existing) => existing.id === id)
      const existing = idx >= 0 ? projects[idx] : undefined
      if (existing !== undefined) {
        projects[idx] = { ...existing, ...withId }
      } else {
        projects.push(withId)
      }
      store.set('projects', projects)
      const savedIdx = idx >= 0 ? idx : projects.length - 1
      const saved = projects[savedIdx]
      if (!saved) throw new Error('store:saveProject — saved project not found after write')
      log.info(`Project saved: ${saved.name}`, { id: saved.id })
      return { ...saved, envVars: decryptEnvVars(saved.envVars) }
    })
  })

  ipcMain.handle('store:deleteProject', (_, id: string) => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid id')
    return serialized(() => {
      const projects = store.get('projects').filter((p) => p.id !== id)
      store.set('projects', projects)
      log.info(`Project deleted`, { id })
    })
  })

  ipcMain.handle('store:getTemplates', () => {
    return store.get('templates')
  })

  ipcMain.handle('store:saveTemplate', (_, template: unknown) => {
    if (!template || typeof template !== 'object') {
      throw new Error('store:saveTemplate requires a non-null object')
    }
    const rawT = template as Record<string, unknown>
    if (rawT.id !== undefined && typeof rawT.id !== 'string')
      throw new Error('store:saveTemplate — id must be a string')
    if (rawT.name !== undefined && typeof rawT.name !== 'string')
      throw new Error('store:saveTemplate — name must be a string')
    if (typeof rawT.name === 'string' && rawT.name.length > 200)
      throw new Error('store:saveTemplate — name too long')
    return serialized(() => {
      const t = template as Partial<Template>
      const templates = store.get('templates')
      const id = t.id ?? randomUUID()
      const withId = { ...t, id } as Template
      const idx = templates.findIndex((existing) => existing.id === id)
      const existingTpl = idx >= 0 ? templates[idx] : undefined
      if (existingTpl !== undefined) {
        templates[idx] = { ...existingTpl, ...withId }
      } else {
        templates.push(withId)
      }
      store.set('templates', templates)
      return templates[idx >= 0 ? idx : templates.length - 1]
    })
  })

  ipcMain.handle('store:deleteTemplate', (_, id: string) => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid id')
    return serialized(() => {
      const templates = store.get('templates').filter((t) => t.id !== id)
      store.set('templates', templates)
    })
  })

  ipcMain.handle('store:getRoles', () => {
    return store.get('roles')
  })

  ipcMain.handle('store:saveRole', (_, role: unknown) => {
    if (!role || typeof role !== 'object') {
      throw new Error('store:saveRole requires a non-null object')
    }
    const rawR = role as Record<string, unknown>
    if (rawR.id !== undefined && typeof rawR.id !== 'string')
      throw new Error('store:saveRole — id must be a string')
    if (rawR.name !== undefined && typeof rawR.name !== 'string')
      throw new Error('store:saveRole — name must be a string')
    if (typeof rawR.name === 'string' && rawR.name.length > 200)
      throw new Error('store:saveRole — name too long')
    return serialized(() => {
      const r = role as Partial<Role>
      const roles = store.get('roles')
      const id = r.id ?? randomUUID()
      const withId = { ...r, id } as Role
      const idx = roles.findIndex((existing) => existing.id === id)
      const existingRole = idx >= 0 ? roles[idx] : undefined
      if (existingRole !== undefined) {
        roles[idx] = { ...existingRole, ...withId }
      } else {
        roles.push(withId)
      }
      store.set('roles', roles)
      return roles[idx >= 0 ? idx : roles.length - 1]
    })
  })

  ipcMain.handle('store:deleteRole', (_, id: string) => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid id')
    return serialized(() => {
      const roles = store.get('roles').filter((r) => r.id !== id)
      store.set('roles', roles)
    })
  })

  return store
}

/** Read roles directly from the store (for use in main process only). */
export function getRolesFromStore(store: AppStore): Role[] {
  return store.get('roles')
}
