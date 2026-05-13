/**
 * Shared validation primitives — usable from main, preload, and renderer.
 *
 * SAFE_ID_RE is the canonical pattern for any caller-controlled identifier
 * that ends up in a filesystem path, IPC channel name, or shell command.
 * Do NOT inline-redefine it elsewhere; import from here.
 */

/** Safe identifier pattern for session IDs, workflow IDs, run IDs, project IDs, etc. */
export const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/

/** Maximum length of a SAFE_ID_RE-validated identifier. */
export const MAX_SAFE_ID_LEN = 128

/**
 * Throw if the value is not a non-empty string matching SAFE_ID_RE within
 * MAX_SAFE_ID_LEN. Returns the validated string for chaining (e.g. inside a
 * filesystem path). Use this instead of redefining a local `safeId()` helper.
 *
 * @param id - The candidate identifier.
 * @param kind - Short label included in the error message (e.g. "workflow id").
 */
export function validateId(id: unknown, kind = 'id'): string {
  if (typeof id !== 'string' || !id || id.length > MAX_SAFE_ID_LEN || !SAFE_ID_RE.test(id)) {
    throw new Error(`Invalid ${kind}: ${typeof id === 'string' ? id : typeof id}`)
  }
  return id
}
