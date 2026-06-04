import type { Project, Session } from '../../shared/types'
import { getDefaultAgent } from '../../shared/agent-helpers'

/** Resolve the agent that runs/ran a session: explicit override → project default → claude-code. */
export function resolveSessionAgent(session: Session, projects: Project[]): string {
  const project = projects.find((p) => p.id === session.projectId)
  return (
    session.agentOverride ??
    (project ? getDefaultAgent(project)?.agent : undefined) ??
    'claude-code'
  )
}
