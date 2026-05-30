/**
 * Canonical agent definitions — single source of truth for all 7 supported agents.
 *
 * Import from here in both main and renderer processes.
 * When adding/removing agents, update ONLY this file:
 *  - Add an entry to AGENTS with all required fields (printFlags, colorVar, short, etc.).
 *  - Optional fields (cdFlag, engineFlags, latestCmd, installedCmd) may be omitted.
 *  - Per-process derived maps below (AGENT_BINARY_MAP, AGENT_PRINT_FLAGS_MAP, etc.)
 *    rebuild automatically.
 *
 * @field contextWindow
 * Last-resort context window for this CLI when active-model detection fails.
 * Prefer `getEffectiveContextWindow` (`src/shared/context-window.ts`) for
 * display everywhere in the renderer. Values here are conservative fallbacks
 * aligned with current provider minimums — NOT claims about any specific
 * model being the CLI's default.
 *
 * @field printFlags
 * Non-interactive / print-mode CLI flags (prompt follows as last arg).
 * Used by the workflow engine to invoke the agent without a TUI.
 *
 * @field cdFlag
 * Native flag for setting the working directory (e.g. `-C`, `--directory`).
 * When present, the engine uses this instead of a shell `cd &&` chain.
 *
 * @field engineFlags
 * Extra flags appended automatically by the workflow engine — not user-configured.
 * Used for workflow-specific needs like non-git project directories.
 *
 * @field colorVar
 * CSS custom property name (without `var()`) holding the agent's signature
 * color. Used by `agentColorVar()` in the renderer.
 *
 * @field short
 * Two-letter mnemonic for compact UI tiles (e.g. "CC" for claude-code).
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
    printFlags: ['--print'],
    // No cdFlag: claude-code has no working-directory option (it operates on the
    // cwd), so the runner cd's into the project dir instead. (`--directory` does
    // not exist and makes every agent node exit 1.)
    colorVar: '--agent-claude',
    short: 'CC',
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
    printFlags: ['exec'],
    cdFlag: '-C',
    engineFlags: ['--skip-git-repo-check'],
    colorVar: '--agent-codex',
    short: 'CX',
    supportsSkills: true,
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
    printFlags: ['--message'],
    colorVar: '--agent-aider',
    short: 'AI',
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
    // Project moved from block/goose to aaif-goose/goose (Linux Foundation AAIF)
    // and switched to a release-asset installer; the old block/goose URL 404s
    // through the GitHub redirect. latestCmd reads the GitHub releases API and
    // returns the tag (e.g. "v1.34.1") — SEMVER_RE in agent-updater strips the
    // "v" prefix on parse. Network failure / rate limit / missing tag_name all
    // produce empty stdout, which the updater treats as "skip the check."
    latestCmd:
      "curl -fsSL https://api.github.com/repos/aaif-goose/goose/releases/latest 2>/dev/null | python3 -c \"import json,sys; print(json.load(sys.stdin).get('tag_name',''))\" 2>/dev/null",
    updateCmd:
      'curl -fsSL https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh | bash',
    printFlags: ['run', '-t'],
    colorVar: '--agent-goose',
    short: 'GS',
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
    printFlags: ['-p'],
    colorVar: '--agent-gemini',
    short: 'GM',
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
    printFlags: ['chat', '--no-interactive', '--trust-all-tools'],
    colorVar: '--agent-amazonq',
    short: 'AQ',
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
    printFlags: ['run'],
    colorVar: '--agent-opencode',
    short: 'OC',
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

/** Agent ID → non-interactive print-mode CLI flags */
export const AGENT_PRINT_FLAGS_MAP: Readonly<Record<string, readonly string[]>> = Object.freeze(
  Object.fromEntries(AGENTS.map((a) => [a.id, a.printFlags])),
)

/** Agent ID → native --cd / -C flag (only set for agents that support it) */
export const AGENT_CD_FLAG_MAP: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(AGENTS.flatMap((a) => ('cdFlag' in a ? [[a.id, a.cdFlag]] : []))),
)

/** Agent ID → engine-injected extra flags (only set for agents that need them) */
export const AGENT_ENGINE_FLAGS_MAP: Readonly<Record<string, readonly string[]>> = Object.freeze(
  Object.fromEntries(AGENTS.flatMap((a) => ('engineFlags' in a ? [[a.id, a.engineFlags]] : []))),
)

/** Sandbox/permission level for an agent node; unset ⇒ 'read'. */
export type AgentPermission = 'read' | 'edit' | 'full'

/** Agent ID → permission level → CLI flags. Only agents with a real
 *  sandbox/permission model appear here; everything else maps to no flags. */
export const AGENT_PERMISSION_FLAGS: Readonly<
  Record<string, Readonly<Record<AgentPermission, readonly string[]>>>
> = Object.freeze({
  'claude-code': {
    read: ['--permission-mode', 'plan'],
    edit: ['--permission-mode', 'acceptEdits'],
    full: ['--dangerously-skip-permissions'],
  },
  codex: {
    read: ['--sandbox', 'read-only'],
    edit: ['--sandbox', 'workspace-write'],
    full: ['--dangerously-bypass-approvals-and-sandbox'],
  },
})

/** Flags for an agent at a permission level. Empty for agents with no model. */
export function getPermissionFlags(
  agentId: string,
  permission: AgentPermission,
): readonly string[] {
  return AGENT_PERMISSION_FLAGS[agentId]?.[permission] ?? []
}

/** Agent ID → CSS variable name (without `var()`) for the agent's signature color */
export const AGENT_COLOR_VAR_MAP: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(AGENTS.map((a) => [a.id, a.colorVar])),
)

/** Agent ID → 2-letter mnemonic for compact UI tiles */
export const AGENT_SHORT_MAP: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(AGENTS.map((a) => [a.id, a.short])),
)

/** Agent ID → whether the agent supports the Codex-style skill prefix
 *  mechanism. Presence of the `supportsSkills` field implies `true`; the
 *  field is never declared as `false`, so a future agent that needs to
 *  *opt out* of an inherited default would need a different shape. */
export const AGENT_SUPPORTS_SKILLS_MAP: Readonly<Record<string, boolean>> = Object.freeze(
  Object.fromEntries(AGENTS.map((a) => [a.id, 'supportsSkills' in a])),
)

/** O(1) lookup map keyed by agent id. Lives here (not in renderer utils) so
 *  main-process code can use it without re-implementing AGENTS.find scans. */
export const AGENT_BY_ID: ReadonlyMap<AgentId, (typeof AGENTS)[number]> = new Map(
  AGENTS.map((a) => [a.id, a] as const),
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
