/**
 * Canonical agent definitions — single source of truth for all 7 supported agents.
 *
 * Import from here in both main and renderer processes.
 * When adding/removing agents, update ONLY this file.
 *
 * @field contextWindow
 * Last-resort context window for this CLI when active-model detection fails.
 * Prefer `getEffectiveContextWindow` (`src/shared/context-window.ts`) for
 * display everywhere in the renderer. Values here are conservative fallbacks
 * aligned with current provider minimums — NOT claims about any specific
 * model being the CLI's default.
 */

export const AGENTS = [
  {
    id: 'claude-code',
    binary: 'claude',
    icon: '⬡',
    name: 'Claude Code',
    description: 'Anthropic AI coding agent',
    contextWindow: 200_000,
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
    contextWindow: 400_000,
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
    contextWindow: 128_000,
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
    contextWindow: 128_000,
    versionArgs: ['version'],
    // Goose is installed via shell script (curl | bash), not pip.
    // No reliable remote version check — leave empty to skip update notifications.
    latestCmd: '',
    updateCmd: 'curl -fsSL https://github.com/block/goose/raw/main/download.sh | bash',
  },
  {
    id: 'gemini-cli',
    binary: 'gemini',
    icon: '◆',
    name: 'Gemini CLI',
    description: 'Google AI terminal agent',
    contextWindow: 1_000_000,
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
    contextWindow: 128_000,
    versionArgs: ['--version'],
    // Amazon Q CLI moved from npm (@amzn/amazon-q-developer-cli-autoinstall, now 404)
    // to a standalone installer. No reliable npm version check available.
    latestCmd: '',
    updateCmd:
      'q update 2>/dev/null || echo "Run: curl -sSf https://desktop-release.codewhisperer.us-east-1.amazonaws.com/latest/q-x86_64-linux.zip -o /tmp/q.zip && unzip -o /tmp/q.zip -d /tmp/q && /tmp/q/q-x86_64-linux/install.sh"',
  },
  {
    id: 'opencode',
    binary: 'opencode',
    icon: '⊡',
    name: 'OpenCode',
    description: 'Open-source terminal AI',
    contextWindow: 128_000,
    versionArgs: ['version'],
    // Package renamed from 'opencode' to 'opencode-ai' on npm
    latestCmd: 'npm view opencode-ai version 2>/dev/null',
    updateCmd: 'npm install -g opencode-ai@latest',
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

/**
 * Validation pattern for agent CLI flags — rejects shell metacharacters.
 * This is the ONLY guard between renderer-controlled flag strings and a
 * `wsl.exe bash -lc` shell command (flags are concatenated unquoted in
 * `node-runners.ts`). Do NOT broaden this character class to include any of:
 *   $, `, (, ), ;, |, &, \, ", ', \n, or the space before a shell operator.
 * Adding even one would enable shell injection.
 */
export const SAFE_FLAGS_RE = /^[A-Za-z0-9 \-_=./:@,]*$/
