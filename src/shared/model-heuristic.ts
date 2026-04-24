/**
 * Infer a context-window count from a raw model id by scanning for
 * explicit size hints in the id itself. Returns undefined when no hint
 * is present; caller falls through to registry pattern / overrides / default.
 *
 * All three regexes are linear — one bounded `\d+`, no nested quantifiers,
 * no alternation with overlapping prefixes. ReDoS-safe. Covered by a 10 KB
 * perf smoke test.
 */
const BRACKET_RE = /\[(\d+)(k|m)\]/i
const DASH_RE = /-(\d+)(k|m)(?:$|[^a-z0-9])/i
const COLON_RE = /:(\d+)(k|m)\b/i

function unitToMultiplier(unit: string): number {
  return unit.toLowerCase() === 'm' ? 1_000_000 : 1_000
}

export function inferContextFromModelId(id: string): number | undefined {
  if (!id) return undefined
  for (const re of [BRACKET_RE, DASH_RE, COLON_RE]) {
    const m = re.exec(id)
    if (m && m[1] && m[2]) {
      const count = parseInt(m[1], 10)
      if (!Number.isFinite(count) || count <= 0) continue
      return count * unitToMultiplier(m[2])
    }
  }
  return undefined
}
