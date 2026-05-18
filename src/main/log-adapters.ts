/**
 * Log adapters for per-agent JSONL cost/token parsing.
 *
 * Each adapter knows where an agent writes its session logs, how to identify
 * which log file corresponds to the current PTY session, and how to extract
 * token-usage data from individual log lines.
 */

import { createLogger } from './logger'
import {
  getClaudePricing as lookupClaudePricing,
  getCodexPricing as lookupCodexPricing,
} from '../shared/model-pricing'

const log = createLogger('log-adapters')

// Future adapter env vars (verified 2026-05-18):
// Goose: XDG-respecting via `directories` crate; source does NOT define a
//   GOOSE_CONFIG_DIR override. Default ~/.config/goose/ , data ~/.local/share/goose/.
// OpenCode: OPENCODE_CONFIG (single file path), OPENCODE_CONFIG_DIR (directory),
//   OPENCODE_CONFIG_CONTENT (inline). No OPENCODE_DATA_DIR.
// Gemini CLI: no env var override; #2815 closed (dup'd to #1825 "respect XDG",
//   deprioritized by maintainers in 2025). Path is hardcoded ~/.gemini/.
// Amazon Q: no env var, free service (no cost tracking needed)

/** Track which schema warnings have already been emitted (avoid flooding). */
const warnedSchemas = new Set<string>()

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { TokenUsage } from '../shared/types'
import type { TokenUsage } from '../shared/types'

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
 * Resolved WSL environment variables that adapters care about — keyed by
 * env var name (e.g. `CLAUDE_CONFIG_DIR`, `CODEX_HOME`). Values are the
 * literal env var contents, or undefined when the var is unset. Adapters
 * declare which keys they read via `getEnvVars()` so the cost tracker
 * resolves only what's actually needed; new adapters do not require
 * structural changes here or in the resolver.
 */
export type AgentEnvContext = Readonly<Record<string, string | undefined>>

export interface LogAdapter {
  agent: string
  /**
   * Names of WSL env vars whose resolved value this adapter wants in
   * AgentEnvContext (e.g. `['CLAUDE_CONFIG_DIR']`). The cost tracker
   * unions getEnvVars() across all adapters and resolves each via WSL once
   * at startup. Return an empty array for adapters that don't need any.
   */
  getEnvVars(): readonly string[]
  /** Return candidate directories (tilde-prefixed) to search for log files. */
  getLogDirs(projectPath: string, env: AgentEnvContext): string[]
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

export function createClaudeAdapter(): LogAdapter {
  return {
    agent: 'claude-code',

    getEnvVars(): readonly string[] {
      return ['CLAUDE_CONFIG_DIR']
    },

    getLogDirs(projectPath: string, env: AgentEnvContext): string[] {
      // Replace every `/` with `-` to match Claude's path-slug convention.
      const pathSlug = projectPath.replace(/\//g, '-')
      // JSONL files live directly in the project slug directory (no sessions/ subdir).
      // Only search the project-specific directory — the old fallback
      // `~/.claude/projects/` recursively scanned ALL projects, returning hundreds
      // of candidates and causing discovery timeouts with multiple concurrent sessions.
      const claudeHome = env['CLAUDE_CONFIG_DIR'] ?? '~/.claude'
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
      const pricing = lookupClaudePricing(model)
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

export function createCodexAdapter(): LogAdapter {
  // Track model per-session via the accumulator reference.
  // Each BoundSession owns a distinct TokenUsage object, so a WeakMap keyed
  // by accumulator avoids cross-session model overwrites (CDX-1).
  const modelBySession = new WeakMap<TokenUsage, string>()

  return {
    agent: 'codex',

    getEnvVars(): readonly string[] {
      return ['CODEX_HOME']
    },

    getLogDirs(_projectPath: string, env: AgentEnvContext): string[] {
      const codexHome = env['CODEX_HOME'] ?? '~/.codex'
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
      const pricing = lookupCodexPricing(model)
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
