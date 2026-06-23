import {
  AGENTS,
  AGENT_BY_ID as SHARED_AGENT_BY_ID,
  AGENT_COLOR_VAR_MAP,
  AGENT_SHORT_MAP,
} from '../../shared/agents'
import { getDefaultAgent } from '../../shared/agent-helpers'
import type { AgentDescriptorWire } from '../../shared/custom-agents'
import type { AgentType, Project } from '../../shared/types'

/** Returns a CSS var() expression (e.g. "var(--agent-claude)") for an agent. */
export function agentColor(id: string | undefined | null): string {
  if (!id) return 'var(--accent)'
  const v = AGENT_COLOR_VAR_MAP[id]
  return v ? `var(${v})` : 'var(--accent)'
}

/** Returns the raw CSS property name ("--agent-claude"), for inline-style use. */
export function agentColorVar(id: string | undefined | null): string {
  if (!id) return '--accent'
  return AGENT_COLOR_VAR_MAP[id] ?? '--accent'
}

/** Returns a 2-letter mnemonic for an agent. */
export function agentShort(id: string | undefined | null): string {
  if (!id) return '·'
  return AGENT_SHORT_MAP[id] ?? id.slice(0, 2).toUpperCase()
}

/** Display metadata resolved from the live agent registry for a given id. */
export interface AgentMeta {
  name: string
  short: string
  colorVar: string
  icon: string
  /** False when the id has no descriptor (e.g. a deleted custom agent). */
  isRegistered: boolean
}

/**
 * Resolve display metadata for an agent id against the live registry.
 *
 * A dangling id (deleted custom agent, or one not yet loaded) returns a
 * neutral fallback so the UI renders visibly-degraded rather than crashing.
 * Pure — the hook `useAgentRegistry` supplies the `registry` argument.
 */
export function selectAgentMeta(registry: AgentDescriptorWire[], id: string): AgentMeta {
  const found = registry.find((d) => d.id === id)
  if (found) {
    return {
      name: found.name,
      short: found.short,
      colorVar: found.colorVar,
      icon: found.icon,
      isRegistered: true,
    }
  }
  return {
    name: id,
    short: id.slice(0, 2).toUpperCase(),
    colorVar: '--accent',
    icon: '●',
    isRegistered: false,
  }
}

/** Re-export of the canonical AGENT_BY_ID map from shared/agents. */
export const AGENT_BY_ID = SHARED_AGENT_BY_ID

/** Canonical ordered list of agent ids (same order as src/shared/agents.ts). */
export const AGENT_IDS = AGENTS.map((a) => a.id as AgentType)

/**
 * Resolve the agent id that should be displayed for a session.
 *
 * Sessions opened via "open project" (no explicit agent pick) leave
 * `agentOverride` undefined, signalling "use whatever the project defaults to".
 * Reading `project.agent` directly is wrong after the multi-agent migration —
 * legacy projects keep `agent` populated, but new/migrated projects store
 * defaults in `project.agents[]` and leave `project.agent` undefined. Going
 * through `getDefaultAgent` handles both shapes.
 */
export function getSessionAgentId(
  session: { agentOverride?: AgentType | undefined } | null | undefined,
  project: Project | null | undefined,
): AgentType {
  if (session?.agentOverride) return session.agentOverride
  if (project) return getDefaultAgent(project).agent
  return 'claude-code'
}
