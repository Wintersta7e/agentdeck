import { useCallback, useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import type { Project, Role, Template } from '../../shared/types'

interface UseProjectsReturn {
  projects: Project[]
  templates: Template[]
  addProject: (project: Partial<Project>) => Promise<Project>
  updateProject: (project: Partial<Project>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  addTemplate: (template: Partial<Template>) => Promise<Template>
  updateTemplate: (template: Partial<Template>) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  roles: Role[]
  addRole: (role: Partial<Role>) => Promise<Role>
  updateRole: (role: Partial<Role>) => Promise<void>
  deleteRole: (id: string) => Promise<void>
}

export function useProjects(): UseProjectsReturn {
  const setProjects = useAppStore((s) => s.setProjects)
  const setTemplates = useAppStore((s) => s.setTemplates)
  const setRoles = useAppStore((s) => s.setRoles)
  const projects = useAppStore((s) => s.projects)
  const templates = useAppStore((s) => s.templates)
  const roles = useAppStore((s) => s.roles)

  useEffect(() => {
    async function load(): Promise<void> {
      if (useAppStore.getState().projects.length > 0) return
      try {
        const [p, t, r] = await Promise.all([
          window.agentDeck.store.getProjects(),
          window.agentDeck.store.getTemplates(),
          window.agentDeck.store.getRoles(),
        ])
        setProjects(p)
        setTemplates(t)
        setRoles(r)
      } catch (err) {
        useAppStore.getState().addNotification('error', `Failed to load projects: ${String(err)}`)
      }
    }
    void load()
  }, [setProjects, setTemplates, setRoles])

  const addProject = useCallback(
    async (project: Partial<Project>): Promise<Project> => {
      try {
        const saved: Project = await window.agentDeck.store.saveProject(project)
        setProjects([...useAppStore.getState().projects, saved])
        return saved
      } catch (err) {
        useAppStore.getState().addNotification('error', `Failed to add project: ${String(err)}`)
        throw err
      }
    },
    [setProjects],
  )

  const updateProject = useCallback(
    async (project: Partial<Project>): Promise<void> => {
      try {
        const saved: Project = await window.agentDeck.store.saveProject(project)
        setProjects(useAppStore.getState().projects.map((p) => (p.id === saved.id ? saved : p)))
      } catch (err) {
        useAppStore.getState().addNotification('error', `Failed to update project: ${String(err)}`)
        throw err
      }
    },
    [setProjects],
  )

  const deleteProject = useCallback(
    async (id: string): Promise<void> => {
      try {
        await window.agentDeck.store.deleteProject(id)
        setProjects(useAppStore.getState().projects.filter((p) => p.id !== id))
      } catch (err) {
        useAppStore.getState().addNotification('error', `Failed to delete project: ${String(err)}`)
        throw err
      }
    },
    [setProjects],
  )

  const addTemplate = useCallback(
    async (template: Partial<Template>): Promise<Template> => {
      try {
        const saved: Template = await window.agentDeck.store.saveTemplate(template)
        setTemplates([...useAppStore.getState().templates, saved])
        return saved
      } catch (err) {
        useAppStore.getState().addNotification('error', `Failed to add template: ${String(err)}`)
        throw err
      }
    },
    [setTemplates],
  )

  const updateTemplate = useCallback(
    async (template: Partial<Template>): Promise<void> => {
      try {
        const saved: Template = await window.agentDeck.store.saveTemplate(template)
        setTemplates(useAppStore.getState().templates.map((t) => (t.id === saved.id ? saved : t)))
      } catch (err) {
        useAppStore.getState().addNotification('error', `Failed to update template: ${String(err)}`)
        throw err
      }
    },
    [setTemplates],
  )

  const deleteTemplate = useCallback(
    async (id: string): Promise<void> => {
      try {
        await window.agentDeck.store.deleteTemplate(id)
        setTemplates(useAppStore.getState().templates.filter((t) => t.id !== id))
      } catch (err) {
        useAppStore.getState().addNotification('error', `Failed to delete template: ${String(err)}`)
        throw err
      }
    },
    [setTemplates],
  )

  const addRole = useCallback(
    async (role: Partial<Role>): Promise<Role> => {
      try {
        const saved: Role = await window.agentDeck.store.saveRole(role)
        setRoles([...useAppStore.getState().roles, saved])
        return saved
      } catch (err) {
        useAppStore.getState().addNotification('error', `Failed to add role: ${String(err)}`)
        throw err
      }
    },
    [setRoles],
  )

  const updateRole = useCallback(
    async (role: Partial<Role>): Promise<void> => {
      try {
        const saved: Role = await window.agentDeck.store.saveRole(role)
        setRoles(useAppStore.getState().roles.map((r) => (r.id === saved.id ? saved : r)))
      } catch (err) {
        useAppStore.getState().addNotification('error', `Failed to update role: ${String(err)}`)
        throw err
      }
    },
    [setRoles],
  )

  const deleteRole = useCallback(
    async (id: string): Promise<void> => {
      try {
        await window.agentDeck.store.deleteRole(id)
        setRoles(useAppStore.getState().roles.filter((r) => r.id !== id))
      } catch (err) {
        useAppStore.getState().addNotification('error', `Failed to delete role: ${String(err)}`)
        throw err
      }
    },
    [setRoles],
  )

  return {
    projects,
    templates,
    addProject,
    updateProject,
    deleteProject,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    roles,
    addRole,
    updateRole,
    deleteRole,
  }
}
