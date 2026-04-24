import { useCallback, useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { handleIpcError } from '../utils/ipcErrorHandler'
import type { Project, Role } from '../../shared/types'

interface UseProjectsReturn {
  projects: Project[]
  addProject: (project: Partial<Project>) => Promise<Project>
  updateProject: (project: Partial<Project>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  roles: Role[]
  addRole: (role: Partial<Role>) => Promise<Role>
  updateRole: (role: Partial<Role>) => Promise<void>
  deleteRole: (id: string) => Promise<void>
}

let loadingInFlight = false

export function useProjects(): UseProjectsReturn {
  const setProjects = useAppStore((s) => s.setProjects)
  const setRoles = useAppStore((s) => s.setRoles)
  const projects = useAppStore((s) => s.projects)
  const roles = useAppStore((s) => s.roles)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      const state = useAppStore.getState()
      if ((state.projects.length > 0 && state.roles.length > 0) || loadingInFlight) return
      loadingInFlight = true
      try {
        // Templates are bootstrapped in main.tsx via bootstrapTemplates() and
        // maintained through the main-process onChange stream — this hook no
        // longer fetches them.
        const [p, r] = await Promise.all([
          window.agentDeck.store.getProjects(),
          window.agentDeck.store.getRoles(),
        ])
        if (!cancelled) {
          setProjects(p)
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
  }, [setProjects, setRoles])

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
    addProject,
    updateProject,
    deleteProject,
    roles,
    addRole,
    updateRole,
    deleteRole,
  }
}
