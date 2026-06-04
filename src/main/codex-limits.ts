import { wslTry } from './wsl-exec'
import type { CodexLimits, PlanWindow } from '../shared/types'

/**
 * One WSL command: find the newest rollout across day folders and print its
 * last line that carries rate_limits. `bash -lc` resolves $HOME to the WSL home.
 */
const FIND_LATEST_RATE_LIMITS =
  'f=$(find "$HOME/.codex/sessions" -name "rollout-*.jsonl" -type f -printf "%T@ %p\\n" 2>/dev/null | sort -n | tail -1 | cut -d" " -f2-); ' +
  '[ -n "$f" ] && tac "$f" | grep -m1 "\\"rate_limits\\""'

function toWindow(raw: unknown): PlanWindow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const usedPercent = r['used_percent']
  const windowMinutes = r['window_minutes']
  const resetsAt = r['resets_at']
  if (
    typeof usedPercent !== 'number' ||
    typeof windowMinutes !== 'number' ||
    typeof resetsAt !== 'number'
  )
    return null
  return { usedPercent, windowMinutes, resetsAt }
}

/** Pure: parse one rollout JSONL line into CodexLimits, or null. */
export function parseCodexLimits(line: string): CodexLimits | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  const payload = obj['payload']
  if (!payload || typeof payload !== 'object') return null
  const rl = (payload as Record<string, unknown>)['rate_limits']
  if (!rl || typeof rl !== 'object') return null
  const rlObj = rl as Record<string, unknown>

  const primary = toWindow(rlObj['primary'])
  const weekly = toWindow(rlObj['secondary'])
  if (primary === null && weekly === null) return null

  const tsRaw = obj['timestamp']
  const asOfParsed = typeof tsRaw === 'string' ? Date.parse(tsRaw) : NaN
  return {
    primary,
    weekly,
    planType: typeof rlObj['plan_type'] === 'string' ? (rlObj['plan_type'] as string) : null,
    asOf: Number.isNaN(asOfParsed) ? null : asOfParsed,
  }
}

/** Best-effort: read current Codex limits from the newest rollout. Null if none. */
export async function readCodexLimits(): Promise<CodexLimits | null> {
  const out = await wslTry(FIND_LATEST_RATE_LIMITS, { logLevelOnError: 'debug', timeout: 5000 })
  if (!out) return null
  const lastLine = out.trim()
  if (!lastLine) return null
  return parseCodexLimits(lastLine)
}
