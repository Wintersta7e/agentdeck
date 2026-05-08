import { AGENTS, AGENT_COLOR_VAR_MAP, AGENT_SHORT_MAP } from '../../shared/agents'
import type { AgentType } from '../../shared/types'

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

/** O(1) lookup map keyed by agent id. */
export const AGENT_BY_ID: ReadonlyMap<AgentType, (typeof AGENTS)[number]> = new Map(
  AGENTS.map((a) => [a.id as AgentType, a]),
)

/** Canonical ordered list of agent ids (same order as src/shared/agents.ts). */
export const AGENT_IDS = AGENTS.map((a) => a.id as AgentType)
