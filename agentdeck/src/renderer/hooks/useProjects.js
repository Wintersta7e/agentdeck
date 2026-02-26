import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'

export function useProjects() {
  const setProjects = useAppStore((s) => s.setProjects)
  const setTemplates = useAppStore((s) => s.setTemplates)
  const projects = useAppStore((s) => s.projects)
  const templates = useAppStore((s) => s.templates)

  useEffect(() => {
    async function load() {
      const [p, t] = await Promise.all([
        window.agentDeck.store.getProjects(),
        window.agentDeck.store.getTemplates()
      ])
      setProjects(p)
      setTemplates(t)
    }
    load()
  }, [setProjects, setTemplates])

  async function addProject(project) {
    const saved = await window.agentDeck.store.saveProject(project)
    const updated = await window.agentDeck.store.getProjects()
    setProjects(updated)
    return saved
  }

  async function updateProject(project) {
    await window.agentDeck.store.saveProject(project)
    const updated = await window.agentDeck.store.getProjects()
    setProjects(updated)
  }

  async function deleteProject(id) {
    await window.agentDeck.store.deleteProject(id)
    const updated = await window.agentDeck.store.getProjects()
    setProjects(updated)
  }

  async function addTemplate(template) {
    const saved = await window.agentDeck.store.saveTemplate(template)
    const updated = await window.agentDeck.store.getTemplates()
    setTemplates(updated)
    return saved
  }

  async function updateTemplate(template) {
    await window.agentDeck.store.saveTemplate(template)
    const updated = await window.agentDeck.store.getTemplates()
    setTemplates(updated)
  }

  async function deleteTemplate(id) {
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
    deleteTemplate
  }
}
