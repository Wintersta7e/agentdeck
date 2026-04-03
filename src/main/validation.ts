/**
 * Shared validation constants for IPC handlers and filesystem operations.
 * Single source of truth — import this instead of defining local copies.
 */

/** Safe identifier pattern for session IDs, workflow IDs, run IDs, project IDs, etc. */
export const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/
