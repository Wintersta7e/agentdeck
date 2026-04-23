/**
 * Normalize a raw model id for registry lookup.
 * Provider-prefixed ids like OpenCode's `anthropic/claude-sonnet-4-5` need the
 * prefix stripped before registry lookup, but the raw id must be preserved
 * as the override-store key. This function is the registry-side normalizer only.
 */
export function normalizeModelId(raw: string): string {
  const trimmed = raw.trim().toLowerCase()
  const segs = trimmed.split('/')
  return segs[segs.length - 1] ?? trimmed
}
