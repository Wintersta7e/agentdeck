/**
 * Shared validation constants for IPC handlers and filesystem operations.
 * Single source of truth — import this instead of defining local copies.
 */

/** Safe identifier pattern for session IDs, workflow IDs, run IDs, project IDs, etc. */
export const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/

/** Maximum length of a SAFE_ID_RE-validated identifier. */
export const MAX_SAFE_ID_LEN = 128

/** Context-window override bounds (tokens). */
export const MIN_CONTEXT_OVERRIDE = 1_000
export const MAX_CONTEXT_OVERRIDE = 10_000_000

export function isValidContextOverride(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= MIN_CONTEXT_OVERRIDE &&
    value <= MAX_CONTEXT_OVERRIDE
  )
}
