import Store from 'electron-store'
import { ipcMain, safeStorage } from 'electron'
import { randomUUID } from 'crypto'
import type { EnvVar, Project, Template } from '../shared/types'

function encryptEnvVars(envVars: EnvVar[] | undefined): EnvVar[] | undefined {
  if (!envVars) return envVars
  if (!safeStorage.isEncryptionAvailable()) return envVars
  return envVars.map((v) => ({
    ...v,
    value: v.secret ? safeStorage.encryptString(v.value).toString('base64') : v.value,
  }))
}

function decryptEnvVars(envVars: EnvVar[] | undefined): EnvVar[] | undefined {
  if (!envVars) return envVars
  if (!safeStorage.isEncryptionAvailable()) return envVars
  return envVars.map((v) => ({
    ...v,
    value: v.secret ? safeStorage.decryptString(Buffer.from(v.value, 'base64')) : v.value,
  }))
}

interface StoreSchema {
  projects: Project[]
  templates: Template[]
}

export function createProjectStore(): Store<StoreSchema> {
  const store = new Store<StoreSchema>({
    defaults: {
      projects: [],
      templates: [],
    },
  })

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
    return projects[idx >= 0 ? idx : projects.length - 1]
  })

  ipcMain.handle('store:deleteProject', (_, id: string) => {
    const projects = store.get('projects').filter((p) => p.id !== id)
    store.set('projects', projects)
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
