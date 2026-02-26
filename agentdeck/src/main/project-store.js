import Store from 'electron-store'
import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'

const schema = {
  projects: { type: 'array', default: [] },
  templates: { type: 'array', default: [] }
}

export function createProjectStore() {
  const store = new Store({ schema })

  // Projects
  ipcMain.handle('store:getProjects', () => {
    return store.get('projects')
  })

  ipcMain.handle('store:saveProject', (_, project) => {
    if (!project || typeof project !== 'object') {
      throw new Error('store:saveProject requires a non-null object')
    }
    const projects = store.get('projects')
    if (!project.id) {
      project.id = randomUUID()
    }
    const idx = projects.findIndex((p) => p.id === project.id)
    if (idx >= 0) {
      projects[idx] = { ...projects[idx], ...project }
    } else {
      projects.push(project)
    }
    store.set('projects', projects)
    return projects[idx >= 0 ? idx : projects.length - 1]
  })

  ipcMain.handle('store:deleteProject', (_, id) => {
    const projects = store.get('projects').filter((p) => p.id !== id)
    store.set('projects', projects)
  })

  // Templates
  ipcMain.handle('store:getTemplates', () => {
    return store.get('templates')
  })

  ipcMain.handle('store:saveTemplate', (_, template) => {
    if (!template || typeof template !== 'object') {
      throw new Error('store:saveTemplate requires a non-null object')
    }
    const templates = store.get('templates')
    if (!template.id) {
      template.id = randomUUID()
    }
    const idx = templates.findIndex((t) => t.id === template.id)
    if (idx >= 0) {
      templates[idx] = { ...templates[idx], ...template }
    } else {
      templates.push(template)
    }
    store.set('templates', templates)
    return templates[idx >= 0 ? idx : templates.length - 1]
  })

  ipcMain.handle('store:deleteTemplate', (_, id) => {
    const templates = store.get('templates').filter((t) => t.id !== id)
    store.set('templates', templates)
  })

  return store
}
