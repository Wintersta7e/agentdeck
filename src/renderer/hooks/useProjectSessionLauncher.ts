import { useCallback } from 'react'
import { useProjects } from './useProjects'
import { useAppStore } from '../store/appStore'
import { getDefaultAgent } from '../../shared/agent-helpers'
import type { AgentConfig, Project } from '../../shared/types'

function newProjectSessionId(projectId: string): string {
  return `session-${projectId}-${Date.now()}`
}

export function useProjectSessionLauncher(): {
  openTerminal: () => void
  openProject: (project: Project) => void
  openProjectWithAgent: (project: Project, agentConfig: AgentConfig) => void
} {
  const addSession = useAppStore((s) => s.addSession)
  const captureSessionSnapshot = useAppStore((s) => s.captureSessionSnapshot)
  const { updateProject } = useProjects()

  const markProjectOpened = useCallback(
    (project: Project) => {
      void updateProject({ ...project, lastOpened: Date.now() }).catch((err: unknown) => {
        window.agentDeck.log.send('warn', 'app', 'Failed to update lastOpened', {
          err: String(err),
        })
      })
    },
    [updateProject],
  )

  const openTerminal = useCallback(() => {
    addSession(`terminal-${Date.now()}`, '')
  }, [addSession])

  const openProject = useCallback(
    (project: Project) => {
      const sessionId = newProjectSessionId(project.id)
      addSession(sessionId, project.id)
      // Resolve through getDefaultAgent so agents[]-migrated projects (whose legacy
      // `project.agent` is undefined) still record a context-window snapshot.
      void captureSessionSnapshot(sessionId, getDefaultAgent(project).agent)
      markProjectOpened(project)
    },
    [addSession, captureSessionSnapshot, markProjectOpened],
  )

  const openProjectWithAgent = useCallback(
    (project: Project, agentConfig: AgentConfig) => {
      const sessionId = newProjectSessionId(project.id)
      const overrides: {
        agentOverride: typeof agentConfig.agent
        agentFlagsOverride?: string
      } = {
        agentOverride: agentConfig.agent,
      }
      if (agentConfig.agentFlags !== undefined) {
        overrides.agentFlagsOverride = agentConfig.agentFlags
      }
      addSession(sessionId, project.id, overrides)
      void captureSessionSnapshot(sessionId, agentConfig.agent)
      markProjectOpened(project)
    },
    [addSession, captureSessionSnapshot, markProjectOpened],
  )

  return { openTerminal, openProject, openProjectWithAgent }
}
