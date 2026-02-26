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
      const [p, t] = await Promise.all([
        window.agentDeck.store.getProjects(),
        window.agentDeck.store.getTemplates(),
      ])
      setProjects(p)
      setTemplates(t)
    }
    void load()
  }, [setProjects, setTemplates])

  async function addProject(project: Partial<Project>): Promise<Project> {
    const saved: Project = await window.agentDeck.store.saveProject(project)
    const updated = await window.agentDeck.store.getProjects()
    setProjects(updated)
    return saved
  }

  async function updateProject(project: Partial<Project>): Promise<void> {
    await window.agentDeck.store.saveProject(project)
    const updated = await window.agentDeck.store.getProjects()
    setProjects(updated)
  }

  async function deleteProject(id: string): Promise<void> {
    await window.agentDeck.store.deleteProject(id)
    const updated = await window.agentDeck.store.getProjects()
    setProjects(updated)
  }

  async function addTemplate(template: Partial<Template>): Promise<Template> {
    const saved: Template = await window.agentDeck.store.saveTemplate(template)
    const updated = await window.agentDeck.store.getTemplates()
    setTemplates(updated)
    return saved
  }

  async function updateTemplate(template: Partial<Template>): Promise<void> {
    await window.agentDeck.store.saveTemplate(template)
    const updated = await window.agentDeck.store.getTemplates()
    setTemplates(updated)
  }

  async function deleteTemplate(id: string): Promise<void> {
    await window.agentDeck.store.deleteTemplate(id)
    const updated = await window.agentDeck.store.getTemplates()
    setTemplates(updated)
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
