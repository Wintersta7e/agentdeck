/**
 * Canonical agent definitions — single source of truth for all 7 supported agents.
 *
 * Import from here in both main and renderer processes.
 * When adding/removing agents, update ONLY this file.
 */

export const AGENTS = [
  {
    id: 'claude-code',
    binary: 'claude',
    icon: '⬡',
    name: 'Claude Code',
    description: 'Anthropic AI coding agent',
  },
  {
    id: 'codex',
    binary: 'codex',
    icon: '◈',
    name: 'Codex',
    description: 'OpenAI CLI agent',
  },
  {
    id: 'aider',
    binary: 'aider',
    icon: '◇',
    name: 'Aider',
    description: 'AI pair programming in terminal',
  },
  {
    id: 'goose',
    binary: 'goose',
    icon: '🪿',
    name: 'Goose',
    description: 'Block open-source AI agent',
  },
  {
    id: 'gemini-cli',
    binary: 'gemini',
    icon: '◆',
    name: 'Gemini CLI',
    description: 'Google AI terminal agent',
  },
  {
    id: 'amazon-q',
    binary: 'q',
    icon: '▣',
    name: 'Amazon Q',
    description: 'AWS AI developer assistant',
  },
  {
    id: 'opencode',
    binary: 'opencode',
    icon: '⊡',
    name: 'OpenCode',
    description: 'Open-source terminal AI',
  },
] as const

/** Union of valid agent IDs */
export type AgentId = (typeof AGENTS)[number]['id']

/** All known agent IDs as a Set for runtime validation */
export const KNOWN_AGENT_IDS = new Set<string>(AGENTS.map((a) => a.id))

/** Agent ID → binary name for PTY spawning and workflow execution */
export const AGENT_BINARY_MAP: Record<string, string> = Object.fromEntries(
  AGENTS.map((a) => [a.id, a.binary]),
)

/** Agent ID → display metadata for UI components */
export const AGENT_DISPLAY: Record<string, { icon: string; name: string; description: string }> =
  Object.fromEntries(
    AGENTS.map((a) => [a.id, { icon: a.icon, name: a.name, description: a.description }]),
  )

/** Validation pattern for agent CLI flags — rejects shell metacharacters */
export const SAFE_FLAGS_RE = /^[A-Za-z0-9 \-_=./:@,]*$/
