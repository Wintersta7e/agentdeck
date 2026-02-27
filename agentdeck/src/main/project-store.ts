import Store from 'electron-store'
import { ipcMain, safeStorage } from 'electron'
import { randomUUID } from 'crypto'
import type { EnvVar, Project, Template } from '../shared/types'
import { createLogger } from './logger'

const log = createLogger('project-store')

function encryptEnvVars(envVars: EnvVar[] | undefined): EnvVar[] | undefined {
  if (!envVars) return envVars
  if (!safeStorage.isEncryptionAvailable()) {
    log.warn('Encryption unavailable — secret env vars stored as plaintext')
    return envVars
  }
  return envVars.map((v) => {
    if (!v.secret) return v
    try {
      return { ...v, value: safeStorage.encryptString(v.value).toString('base64') }
    } catch (err) {
      log.error('Failed to encrypt env var, storing as plaintext', { err: String(err) })
      return v
    }
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
      log.error('Failed to decrypt env var, returning empty value', { err: String(err) })
      return { ...v, value: '' }
    }
  })
}

export interface StoreSchema {
  projects: Project[]
  templates: Template[]
  appPrefs: { zoomFactor: number; zoomAutoDetected?: boolean }
}

export type AppStore = Store<StoreSchema>

export function createProjectStore(): Store<StoreSchema> {
  const store = new Store<StoreSchema>({
    defaults: {
      projects: [],
      templates: [],
      appPrefs: { zoomFactor: 1.0 },
    },
  })

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

  ipcMain.handle('store:getProjects', () => {
    const projects = store.get('projects')
    return projects.map((p) => ({ ...p, envVars: decryptEnvVars(p.envVars) }))
  })

  ipcMain.handle('store:saveProject', (_, project: unknown) => {
    if (!project || typeof project !== 'object') {
      throw new Error('store:saveProject requires a non-null object')
    }
    const p = project as Partial<Project>
    const projects = store.get('projects')
    const id = p.id ?? randomUUID()
    const withId = { ...p, id, envVars: encryptEnvVars(p.envVars) } as Project
    const idx = projects.findIndex((existing) => existing.id === id)
    const existing = idx >= 0 ? projects[idx] : undefined
    if (existing != null) {
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

  ipcMain.handle('store:deleteProject', (_, id: string) => {
    const projects = store.get('projects').filter((p) => p.id !== id)
    store.set('projects', projects)
    log.info(`Project deleted`, { id })
  })

  ipcMain.handle('store:getTemplates', () => {
    return store.get('templates')
  })

  ipcMain.handle('store:saveTemplate', (_, template: unknown) => {
    if (!template || typeof template !== 'object') {
      throw new Error('store:saveTemplate requires a non-null object')
    }
    const t = template as Partial<Template>
    const templates = store.get('templates')
    const id = t.id ?? randomUUID()
    const withId = { ...t, id } as Template
    const idx = templates.findIndex((existing) => existing.id === id)
    const existingTpl = idx >= 0 ? templates[idx] : undefined
    if (existingTpl != null) {
      templates[idx] = { ...existingTpl, ...withId }
    } else {
      templates.push(withId)
    }
    store.set('templates', templates)
    return templates[idx >= 0 ? idx : templates.length - 1]
  })

  ipcMain.handle('store:deleteTemplate', (_, id: string) => {
    const templates = store.get('templates').filter((t) => t.id !== id)
    store.set('templates', templates)
  })

  return store
}
