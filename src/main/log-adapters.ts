/**
 * Log adapters for per-agent JSONL cost/token parsing.
 *
 * Each adapter knows where an agent writes its session logs, how to identify
 * which log file corresponds to the current PTY session, and how to extract
 * token-usage data from individual log lines.
 */

import { createLogger } from './logger'

const log = createLogger('log-adapters')

// Future adapter env vars:
// Goose: GOOSE_CONFIG_DIR (config), data at ~/.local/share/goose/
// OpenCode: OPENCODE_DATA_DIR (data), OPENCODE_CONFIG_DIR (config)
// Gemini CLI: no env var yet (requested: github.com/google-gemini/gemini-cli/issues/2815)
// Amazon Q: no env var, free service (no cost tracking needed)

/** Track which schema warnings have already been emitted (avoid flooding). */
const warnedSchemas = new Set<string>()

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenUsage {
  /** Non-cached input tokens (excludes cache reads for both Claude and Codex). */
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalCostUsd: number
}

export const ZERO_USAGE: Readonly<TokenUsage> = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalCostUsd: 0,
})

/**
 * Resolved WSL environment variables for agent config directories.
 * These are read from the WSL environment (via wslExec), NOT from Node's process.env.
 * Each field is the resolved absolute path, or undefined if the env var is unset.
 */
export interface AgentEnvContext {
  /** $CLAUDE_CONFIG_DIR — overrides ~/.claude */
  claudeConfigDir?: string | undefined
  /** $CODEX_HOME — overrides ~/.codex */
  codexHome?: string | undefined
}

export interface LogAdapter {
  agent: string
  /** Return candidate directories (tilde-prefixed) to search for log files. */
  getLogDirs(projectPath: string, env?: AgentEnvContext): string[]
  /** Glob pattern for log files within the dir. */
  getFilePattern(): string
  /**
   * Given the first few lines of a log file, decide whether this file belongs
   * to the session spawned at `spawnAt` for the project at `cwd`.
   */
  matchSession(firstLines: string[], cwd: string, spawnAt: number): boolean
  /**
   * Parse a single JSONL line and return an updated TokenUsage, or null if
   * the line carries no usage data.
   */
  parseUsage(line: string, accumulator: TokenUsage): TokenUsage | null
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * Format a token count for display.
 * - Under 1 000: raw integer string.
 * - 1 000 and above: one-decimal `k` suffix (e.g. `"1.5k"`, `"12.3k"`).
 */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}k`
}

/**
 * Format a USD cost for display.
 * - Zero returns `""` (nothing to show).
 * - Non-zero returns `"$X.XX"` with exactly 2 decimal places.
 */
export function formatCost(usd: number): string {
  if (usd === 0) return ''
  return `$${usd.toFixed(2)}`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return today's date as `YYYY/MM/DD`. */
function todayDateDir(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}

/** Return true if any stringified line contains the target substring. */
function anyLineContains(lines: string[], target: string): boolean {
  return lines.some((l) => l.includes(target))
}

// ---------------------------------------------------------------------------
// ClaudeAdapter
// ---------------------------------------------------------------------------

/** Per-model pricing for Claude cost estimation. */
const CLAUDE_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  opus: { inputPer1M: 5.0, outputPer1M: 25.0 },
  sonnet: { inputPer1M: 3.0, outputPer1M: 15.0 },
  haiku: { inputPer1M: 1.0, outputPer1M: 5.0 },
}

/** Match a Claude model ID (e.g. "claude-opus-4-6") to a pricing tier. */
function getClaudePricing(model: string): { inputPer1M: number; outputPer1M: number } | undefined {
  for (const [tier, pricing] of Object.entries(CLAUDE_PRICING)) {
    if (model.includes(tier)) return pricing
  }
  return undefined
}

export function createClaudeAdapter(): LogAdapter {
  return {
    agent: 'claude-code',

    getLogDirs(projectPath: string, env?: AgentEnvContext): string[] {
      // Replace every `/` with `-` to match Claude's path-slug convention.
      const pathSlug = projectPath.replace(/\//g, '-')
      // JSONL files live directly in the project slug directory (no sessions/ subdir).
      // Only search the project-specific directory — the old fallback
      // `~/.claude/projects/` recursively scanned ALL projects, returning hundreds
      // of candidates and causing discovery timeouts with multiple concurrent sessions.
      const claudeHome = env?.claudeConfigDir ?? '~/.claude'
      return [`${claudeHome}/projects/${pathSlug}/`]
    },

    getFilePattern(): string {
      return '*.jsonl'
    },

    matchSession(firstLines: string[], cwd: string, _spawnAt: number): boolean {
      return anyLineContains(firstLines, cwd)
    },

    parseUsage(line: string, accumulator: TokenUsage): TokenUsage | null {
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        return null
      }

      if (typeof parsed !== 'object' || parsed === null) return null

      const obj = parsed as Record<string, unknown>
      const message = obj['message']
      if (typeof message !== 'object' || message === null) return null

      const msg = message as Record<string, unknown>

      // Claude Code logs both streaming partials (stop_reason: null) and the
      // final entry (stop_reason: "end_turn" / "tool_use" / etc.) for the same
      // API call, with identical usage blocks.  Only count the final entry.
      const stopReason = msg['stop_reason']
      if (stopReason === null || stopReason === undefined) return null

      const usage = msg['usage']
      if (typeof usage !== 'object' || usage === null) {
        const warnKey = 'claude:missing-usage'
        if (!warnedSchemas.has(warnKey)) {
          warnedSchemas.add(warnKey)
          log.warn('Claude JSONL schema unexpected: missing message.usage field', {
            line: line.slice(0, 100),
          })
        }
        return null
      }

      const u = usage as Record<string, unknown>
      const inputTokens = typeof u['input_tokens'] === 'number' ? u['input_tokens'] : 0
      const outputTokens = typeof u['output_tokens'] === 'number' ? u['output_tokens'] : 0
      const cacheReadTokens =
        typeof u['cache_read_input_tokens'] === 'number' ? u['cache_read_input_tokens'] : 0
      const cacheWriteTokens =
        typeof u['cache_creation_input_tokens'] === 'number' ? u['cache_creation_input_tokens'] : 0

      // Compute cost from model pricing (Claude JSONL has no costUSD field).
      // Cache writes cost 1.25× base input; cache reads cost 0.1× base input.
      const model = typeof msg['model'] === 'string' ? (msg['model'] as string) : ''
      const pricing = getClaudePricing(model)
      const turnCost =
        pricing !== undefined
          ? (inputTokens / 1_000_000) * pricing.inputPer1M +
            (cacheReadTokens / 1_000_000) * pricing.inputPer1M * 0.1 +
            (cacheWriteTokens / 1_000_000) * pricing.inputPer1M * 1.25 +
            (outputTokens / 1_000_000) * pricing.outputPer1M
          : 0

      return {
        inputTokens: accumulator.inputTokens + inputTokens,
        outputTokens: accumulator.outputTokens + outputTokens,
        cacheReadTokens: accumulator.cacheReadTokens + cacheReadTokens,
        cacheWriteTokens: accumulator.cacheWriteTokens + cacheWriteTokens,
        totalCostUsd: accumulator.totalCostUsd + turnCost,
      }
    },
  }
}

// ---------------------------------------------------------------------------
// CodexAdapter
// ---------------------------------------------------------------------------

/** Per-model pricing for cost estimation. */
const CODEX_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10.0 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  o3: { inputPer1M: 2.0, outputPer1M: 8.0 },
  'o4-mini': { inputPer1M: 1.1, outputPer1M: 4.4 },
  'codex-mini': { inputPer1M: 1.5, outputPer1M: 6.0 },
  'gpt-5.3': { inputPer1M: 2.0, outputPer1M: 8.0 },
  'gpt-5.4': { inputPer1M: 2.0, outputPer1M: 8.0 },
  'gpt-5.3-codex': { inputPer1M: 2.0, outputPer1M: 8.0 },
}

export function createCodexAdapter(): LogAdapter {
  // Track model per-session via the accumulator reference.
  // Each BoundSession owns a distinct TokenUsage object, so a WeakMap keyed
  // by accumulator avoids cross-session model overwrites (CDX-1).
  const modelBySession = new WeakMap<TokenUsage, string>()

  return {
    agent: 'codex',

    getLogDirs(_projectPath: string, env?: AgentEnvContext): string[] {
      const codexHome = env?.codexHome ?? '~/.codex'
      return [`${codexHome}/sessions/${todayDateDir()}`]
    },

    getFilePattern(): string {
      return 'rollout-*.jsonl'
    },

    matchSession(firstLines: string[], cwd: string, _spawnAt: number): boolean {
      return anyLineContains(firstLines, cwd)
    },

    parseUsage(line: string, accumulator: TokenUsage): TokenUsage | null {
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        return null
      }

      if (typeof parsed !== 'object' || parsed === null) return null

      const obj = parsed as Record<string, unknown>
      const payload = obj['payload']
      if (typeof payload !== 'object' || payload === null) return null

      const p = payload as Record<string, unknown>

      // Extract model from turn_context events for pricing lookup.
      // Stored per-accumulator so concurrent sessions don't overwrite each other (CDX-1).
      if (p['turn_id'] && typeof p['model'] === 'string') {
        modelBySession.set(accumulator, p['model'] as string)
      }

      if (p['type'] !== 'token_count') return null

      // token_count events have payload.info with total_token_usage
      // First event may have info: null (just rate limits) — skip those
      const info = p['info']
      if (typeof info !== 'object' || info === null) return null

      const infoObj = info as Record<string, unknown>
      const usage = infoObj['total_token_usage']
      if (typeof usage !== 'object' || usage === null) {
        const warnKey = 'codex:missing-total_token_usage'
        if (!warnedSchemas.has(warnKey)) {
          warnedSchemas.add(warnKey)
          log.warn(
            'Codex JSONL schema unexpected: missing info.total_token_usage in token_count event',
            {
              line: line.slice(0, 100),
            },
          )
        }
        return null
      }

      const u = usage as Record<string, number>
      const rawInputTokens = u['input_tokens'] ?? 0
      const outputTokens = u['output_tokens'] ?? 0
      const cachedInputTokens = u['cached_input_tokens'] ?? 0

      // Codex token_count events are CUMULATIVE — replace accumulator values.
      // Codex input_tokens INCLUDES cached_input_tokens as a subset.
      // Normalize to non-cached input only (matches Claude adapter semantics).
      const nonCachedInput = rawInputTokens - cachedInputTokens
      const model = modelBySession.get(accumulator) ?? ''
      const pricing = CODEX_PRICING[model]
      const totalCostUsd =
        pricing !== undefined
          ? (rawInputTokens / 1_000_000) * pricing.inputPer1M +
            (outputTokens / 1_000_000) * pricing.outputPer1M
          : 0

      const result: TokenUsage = {
        inputTokens: nonCachedInput,
        outputTokens,
        cacheReadTokens: cachedInputTokens,
        cacheWriteTokens: accumulator.cacheWriteTokens,
        totalCostUsd,
      }
      // Carry model forward so the next parseUsage call (with the new accumulator
      // replacing the old one) still has the model association.
      if (model) modelBySession.set(result, model)
      return result
    },
  }
}
