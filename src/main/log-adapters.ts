/**
 * Log adapters for per-agent JSONL cost/token parsing.
 *
 * Each adapter knows where an agent writes its session logs, how to identify
 * which log file corresponds to the current PTY session, and how to extract
 * token-usage data from individual log lines.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenUsage {
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

export interface LogAdapter {
  agent: string
  /** Return candidate directories (tilde-prefixed) to search for log files. */
  getLogDirs(projectPath: string): string[]
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

    getLogDirs(projectPath: string): string[] {
      // Replace every `/` with `-` to match Claude's path-slug convention.
      const pathSlug = projectPath.replace(/\//g, '-')
      return [`~/.claude/projects/${pathSlug}/sessions/`, `~/.claude/projects/`]
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
      const usage = msg['usage']
      if (typeof usage !== 'object' || usage === null) return null

      const u = usage as Record<string, unknown>
      const inputTokens = typeof u['input_tokens'] === 'number' ? u['input_tokens'] : 0
      const outputTokens = typeof u['output_tokens'] === 'number' ? u['output_tokens'] : 0
      const cacheReadTokens =
        typeof u['cache_read_input_tokens'] === 'number' ? u['cache_read_input_tokens'] : 0
      const cacheWriteTokens =
        typeof u['cache_creation_input_tokens'] === 'number' ? u['cache_creation_input_tokens'] : 0
      const costUsd = typeof obj['costUSD'] === 'number' ? obj['costUSD'] : 0

      return {
        inputTokens: accumulator.inputTokens + inputTokens,
        outputTokens: accumulator.outputTokens + outputTokens,
        cacheReadTokens: accumulator.cacheReadTokens + cacheReadTokens,
        cacheWriteTokens: accumulator.cacheWriteTokens + cacheWriteTokens,
        totalCostUsd: accumulator.totalCostUsd + costUsd,
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
}

export function createCodexAdapter(): LogAdapter {
  return {
    agent: 'codex',

    getLogDirs(_projectPath: string): string[] {
      return [`~/.codex/sessions/${todayDateDir()}`]
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
      if (p['type'] !== 'token_count') return null

      const inputTokens = typeof p['input_tokens'] === 'number' ? p['input_tokens'] : 0
      const outputTokens = typeof p['output_tokens'] === 'number' ? p['output_tokens'] : 0

      // Codex token_count events are CUMULATIVE — replace accumulator values.
      const model = typeof obj['model'] === 'string' ? obj['model'] : ''
      const pricing = CODEX_PRICING[model]
      const totalCostUsd =
        pricing !== undefined
          ? (inputTokens / 1_000_000) * pricing.inputPer1M +
            (outputTokens / 1_000_000) * pricing.outputPer1M
          : 0

      return {
        inputTokens,
        outputTokens,
        cacheReadTokens: accumulator.cacheReadTokens,
        cacheWriteTokens: accumulator.cacheWriteTokens,
        totalCostUsd,
      }
    },
  }
}
