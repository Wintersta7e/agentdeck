/**
 * Helpers for narrowing Node fs errors. Kept separate from `fs-atomic.ts`
 * (which is about write atomicity) so callers can import only what they need.
 */

/** True when `err` is a Node fs error with `code === 'ENOENT'` (missing file/dir). */
export function isEnoent(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'ENOENT'
}
