import { useCallback, useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { handleIpcError } from '../utils/ipcErrorHandler'
import type { Project, Role, LegacyTemplate as Template } from '../../shared/types'

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

let loadingInFlight = false

export function useProjects(): UseProjectsReturn {
  const setProjects = useAppStore((s) => s.setProjects)
  const setTemplates = useAppStore((s) => s.setTemplates)
  const setRoles = useAppStore((s) => s.setRoles)
  const projects = useAppStore((s) => s.projects)
  const templates = useAppStore((s) => s.templates)
  const roles = useAppStore((s) => s.roles)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      const state = useAppStore.getState()
      if (
        (state.projects.length > 0 && state.templates.length > 0 && state.roles.length > 0) ||
        loadingInFlight
      )
        return
      loadingInFlight = true
      try {
        const [p, t, r] = await Promise.all([
          window.agentDeck.store.getProjects(),
          window.agentDeck.store.getTemplates(),
          window.agentDeck.store.getRoles(),
        ])
        if (!cancelled) {
          setProjects(p)
          setTemplates(t)
          setRoles(r)
        }
      } catch (err) {
        if (!cancelled) {
          handleIpcError(err, 'Failed to load data')
        }
      } finally {
        loadingInFlight = false
      }
    }
    void load()
    return () => {
      cancelled = true
      loadingInFlight = false // Allow retry on StrictMode remount
    }
  }, [setProjects, setTemplates, setRoles])

  const addProject = useCallback(
    async (project: Partial<Project>): Promise<Project> => {
      try {
        const saved: Project = await window.agentDeck.store.saveProject(project)
        const current = useAppStore.getState().projects
        // Guard against duplicate: only add if not already present (concurrent add race)
        if (current.some((p) => p.id === saved.id)) {
          setProjects(current.map((p) => (p.id === saved.id ? saved : p)))
        } else {
          setProjects([...current, saved])
        }
        return saved
      } catch (err) {
        handleIpcError(err, 'Failed to add project')
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
        handleIpcError(err, 'Failed to update project')
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
        handleIpcError(err, 'Failed to delete project')
        throw err
      }
    },
    [setProjects],
  )

  const addTemplate = useCallback(
    async (template: Partial<Template>): Promise<Template> => {
      try {
        const saved: Template = await window.agentDeck.store.saveTemplate(template)
        const current = useAppStore.getState().templates
        if (current.some((t) => t.id === saved.id)) {
          setTemplates(current.map((t) => (t.id === saved.id ? saved : t)))
        } else {
          setTemplates([...current, saved])
        }
        return saved
      } catch (err) {
        handleIpcError(err, 'Failed to add template')
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
        handleIpcError(err, 'Failed to update template')
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
        handleIpcError(err, 'Failed to delete template')
        throw err
      }
    },
    [setTemplates],
  )

  const addRole = useCallback(
    async (role: Partial<Role>): Promise<Role> => {
      try {
        const saved: Role = await window.agentDeck.store.saveRole(role)
        const current = useAppStore.getState().roles
        if (current.some((r) => r.id === saved.id)) {
          setRoles(current.map((r) => (r.id === saved.id ? saved : r)))
        } else {
          setRoles([...current, saved])
        }
        return saved
      } catch (err) {
        handleIpcError(err, 'Failed to add role')
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
        handleIpcError(err, 'Failed to update role')
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
        handleIpcError(err, 'Failed to delete role')
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
