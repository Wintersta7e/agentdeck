import Store from 'electron-store'
import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import type { Project, Template } from '../shared/types'

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
    return store.get('projects')
  })

  ipcMain.handle('store:saveProject', (_, project: unknown) => {
    if (!project || typeof project !== 'object') {
      throw new Error('store:saveProject requires a non-null object')
    }
    const p = project as Partial<Project>
    const projects = store.get('projects')
    const id = p.id ?? randomUUID()
    const withId = { ...p, id } as Project
    const idx = projects.findIndex((existing) => existing.id === id)
    if (idx >= 0) {
      projects[idx] = { ...projects[idx]!, ...withId }
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
    if (idx >= 0) {
      templates[idx] = { ...templates[idx]!, ...withId }
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
