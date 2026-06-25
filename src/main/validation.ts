/**
 * Main-process validation re-exports + context-window helpers.
 *
 * SAFE_ID_RE / MAX_SAFE_ID_LEN / validateId now live in `src/shared/validation`
 * so renderer-side callers can use them too. This module re-exports them so
 * existing `import { SAFE_ID_RE } from '../validation'` paths keep working.
 */

export { SAFE_ID_RE, MAX_SAFE_ID_LEN, validateId } from '../shared/validation'

/**
 * Throw if `days` is not a number in [1, 365]; return it otherwise. Shared by
 * the session- and usage-history IPC handlers, which both accept a day window.
 */
export function validateDays(days: unknown): number {
  if (typeof days !== 'number' || days < 1 || days > 365) {
    throw new Error('Invalid days parameter')
  }
  return days
}

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
