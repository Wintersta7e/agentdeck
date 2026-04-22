import { AGENTS } from '../../shared/agents'
import type { AgentType } from '../../shared/types'

/** Map of agent id → CSS variable that holds its signature color. */
const AGENT_COLOR_VAR: Record<string, string> = {
  'claude-code': '--agent-claude',
  codex: '--agent-codex',
  aider: '--agent-aider',
  goose: '--agent-goose',
  'gemini-cli': '--agent-gemini',
  'amazon-q': '--agent-amazonq',
  opencode: '--agent-opencode',
}

/** Short two-letter mnemonic per agent — matches prototype "B1" tiles. */
const AGENT_SHORT: Record<string, string> = {
  'claude-code': 'CC',
  codex: 'CX',
  aider: 'AI',
  goose: 'GS',
  'gemini-cli': 'GM',
  'amazon-q': 'AQ',
  opencode: 'OC',
}

/** Returns a CSS var() expression (e.g. "var(--agent-claude)") for an agent. */
export function agentColor(id: string | undefined | null): string {
  if (!id) return 'var(--accent)'
  const v = AGENT_COLOR_VAR[id]
  return v ? `var(${v})` : 'var(--accent)'
}

/** Returns the raw CSS property name ("--agent-claude"), for inline-style use. */
export function agentColorVar(id: string | undefined | null): string {
  if (!id) return '--accent'
  return AGENT_COLOR_VAR[id] ?? '--accent'
}

/** Returns a 2-letter mnemonic for an agent. */
export function agentShort(id: string | undefined | null): string {
  if (!id) return '·'
  return AGENT_SHORT[id] ?? id.slice(0, 2).toUpperCase()
}

/** O(1) lookup map keyed by agent id. */
export const AGENT_BY_ID: ReadonlyMap<AgentType, (typeof AGENTS)[number]> = new Map(
  AGENTS.map((a) => [a.id as AgentType, a]),
)

/** Canonical ordered list of agent ids (same order as src/shared/agents.ts). */
export const AGENT_IDS = AGENTS.map((a) => a.id as AgentType)
