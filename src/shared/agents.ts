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
    versionArgs: ['--version'],
    latestCmd: 'npm view @anthropic-ai/claude-code version 2>/dev/null',
    updateCmd: 'npm install -g @anthropic-ai/claude-code@latest',
  },
  {
    id: 'codex',
    binary: 'codex',
    icon: '◈',
    name: 'Codex',
    description: 'OpenAI CLI agent',
    versionArgs: ['--version'],
    installedCmd: 'npm list -g @openai/codex --json 2>/dev/null',
    latestCmd: 'npm view @openai/codex version 2>/dev/null',
    updateCmd: 'npm install -g @openai/codex@latest',
  },
  {
    id: 'aider',
    binary: 'aider',
    icon: '◇',
    name: 'Aider',
    description: 'AI pair programming in terminal',
    versionArgs: ['--version'],
    latestCmd: 'pip index versions aider-chat 2>/dev/null | head -1',
    updateCmd: 'pip install --upgrade aider-chat',
  },
  {
    id: 'goose',
    binary: 'goose',
    icon: '🪿',
    name: 'Goose',
    description: 'Block open-source AI agent',
    versionArgs: ['--version'],
    latestCmd: 'pip index versions goose-ai 2>/dev/null | head -1',
    updateCmd: 'pip install --upgrade goose-ai',
  },
  {
    id: 'gemini-cli',
    binary: 'gemini',
    icon: '◆',
    name: 'Gemini CLI',
    description: 'Google AI terminal agent',
    versionArgs: ['--version'],
    latestCmd: 'npm view @google/gemini-cli version 2>/dev/null',
    updateCmd: 'npm install -g @google/gemini-cli@latest',
  },
  {
    id: 'amazon-q',
    binary: 'q',
    icon: '▣',
    name: 'Amazon Q',
    description: 'AWS AI developer assistant',
    versionArgs: ['--version'],
    latestCmd: 'npm view @amzn/amazon-q-developer-cli-autoinstall version 2>/dev/null',
    updateCmd: 'npm install -g @amzn/amazon-q-developer-cli-autoinstall@latest',
  },
  {
    id: 'opencode',
    binary: 'opencode',
    icon: '⊡',
    name: 'OpenCode',
    description: 'Open-source terminal AI',
    versionArgs: ['version'],
    latestCmd: 'npm view opencode version 2>/dev/null',
    updateCmd: 'npm install -g opencode@latest',
  },
] as const

/** Union of valid agent IDs */
export type AgentId = (typeof AGENTS)[number]['id']

/** All known agent IDs as a Set for runtime validation */
export const KNOWN_AGENT_IDS = new Set<string>(AGENTS.map((a) => a.id))

/** Agent ID → binary name for PTY spawning and workflow execution */
export const AGENT_BINARY_MAP: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(AGENTS.map((a) => [a.id, a.binary])),
)

/** Agent ID → display name for UI */
export const AGENT_DISPLAY: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(AGENTS.map((a) => [a.id, a.name])),
)

/** Validation pattern for agent CLI flags — rejects shell metacharacters */
export const SAFE_FLAGS_RE = /^[A-Za-z0-9 \-_=./:@,]*$/
