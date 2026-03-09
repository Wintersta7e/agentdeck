import type { AgentConfig, Project } from './types'

const FALLBACK: Readonly<AgentConfig> = Object.freeze({ agent: 'claude-code', isDefault: true })

/** Get the default agent for a project (backward-compatible with legacy `agent` field). */
export function getDefaultAgent(project: Project): AgentConfig {
  if (project.agents && project.agents.length > 0) {
    const found = project.agents.find((a) => a.isDefault)
    // Length already checked > 0 above, so [0] is safe
    return found ?? project.agents[0] ?? FALLBACK
  }
  if (project.agent) {
    return { agent: project.agent, agentFlags: project.agentFlags, isDefault: true }
  }
  return FALLBACK
}

/** Get all configured agents for a project (backward-compatible). */
export function getProjectAgents(project: Project): AgentConfig[] {
  if (project.agents && project.agents.length > 0) {
    return project.agents
  }
  if (project.agent) {
    return [{ agent: project.agent, agentFlags: project.agentFlags, isDefault: true }]
  }
  return [FALLBACK]
}

/**
 * Migrate a project from legacy single-agent to agents array.
 * Returns the same project reference if no migration needed.
 */
export function migrateProjectAgents(project: Project): Project {
  if (project.agents && project.agents.length > 0) return project
  if (!project.agent) return project
  return {
    ...project,
    agents: [{ agent: project.agent, agentFlags: project.agentFlags, isDefault: true }],
    agent: undefined,
    agentFlags: undefined,
  }
}
