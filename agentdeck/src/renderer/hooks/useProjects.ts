import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import type { Project, Template } from '../../shared/types'

interface UseProjectsReturn {
  projects: Project[]
  templates: Template[]
  addProject: (project: Partial<Project>) => Promise<Project>
  updateProject: (project: Partial<Project>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  addTemplate: (template: Partial<Template>) => Promise<Template>
  updateTemplate: (template: Partial<Template>) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
}

export function useProjects(): UseProjectsReturn {
  const setProjects = useAppStore((s) => s.setProjects)
  const setTemplates = useAppStore((s) => s.setTemplates)
  const projects = useAppStore((s) => s.projects)
  const templates = useAppStore((s) => s.templates)

  useEffect(() => {
    async function load(): Promise<void> {
      if (useAppStore.getState().projects.length > 0) return
      try {
        const [p, t] = await Promise.all([
          window.agentDeck.store.getProjects(),
          window.agentDeck.store.getTemplates(),
        ])
        setProjects(p)
        setTemplates(t)
      } catch (err) {
        useAppStore.getState().addNotification('error', `Failed to load projects: ${String(err)}`)
      }
    }
    void load()
  }, [setProjects, setTemplates])

  async function addProject(project: Partial<Project>): Promise<Project> {
    try {
      const saved: Project = await window.agentDeck.store.saveProject(project)
      setProjects([...useAppStore.getState().projects, saved])
      return saved
    } catch (err) {
      useAppStore.getState().addNotification('error', `Failed to add project: ${String(err)}`)
      throw err
    }
  }

  async function updateProject(project: Partial<Project>): Promise<void> {
    try {
      const saved: Project = await window.agentDeck.store.saveProject(project)
      setProjects(useAppStore.getState().projects.map((p) => (p.id === saved.id ? saved : p)))
    } catch (err) {
      useAppStore.getState().addNotification('error', `Failed to update project: ${String(err)}`)
      throw err
    }
  }

  async function deleteProject(id: string): Promise<void> {
    try {
      await window.agentDeck.store.deleteProject(id)
      setProjects(useAppStore.getState().projects.filter((p) => p.id !== id))
    } catch (err) {
      useAppStore.getState().addNotification('error', `Failed to delete project: ${String(err)}`)
      throw err
    }
  }

  async function addTemplate(template: Partial<Template>): Promise<Template> {
    try {
      const saved: Template = await window.agentDeck.store.saveTemplate(template)
      setTemplates([...useAppStore.getState().templates, saved])
      return saved
    } catch (err) {
      useAppStore.getState().addNotification('error', `Failed to add template: ${String(err)}`)
      throw err
    }
  }

  async function updateTemplate(template: Partial<Template>): Promise<void> {
    try {
      const saved: Template = await window.agentDeck.store.saveTemplate(template)
      setTemplates(useAppStore.getState().templates.map((t) => (t.id === saved.id ? saved : t)))
    } catch (err) {
      useAppStore.getState().addNotification('error', `Failed to update template: ${String(err)}`)
      throw err
    }
  }

  async function deleteTemplate(id: string): Promise<void> {
    try {
      await window.agentDeck.store.deleteTemplate(id)
      setTemplates(useAppStore.getState().templates.filter((t) => t.id !== id))
    } catch (err) {
      useAppStore.getState().addNotification('error', `Failed to delete template: ${String(err)}`)
      throw err
    }
  }

  return {
    projects,
    templates,
    addProject,
    updateProject,
    deleteProject,
    addTemplate,
    updateTemplate,
    deleteTemplate,
  }
}
