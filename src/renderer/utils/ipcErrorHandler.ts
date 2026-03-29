import { useAppStore } from '../store/appStore'

/**
 * Maps technical IPC error substrings to user-friendly messages.
 * Order matters — first match wins.
 */
const ERROR_MAP: ReadonlyArray<readonly [pattern: string, friendly: string]> = [
  ['non-null object', 'Invalid data — please check your inputs'],
  ['Invalid id', 'Could not find that item — it may have been deleted'],
  ['Maximum concurrent sessions', 'Too many terminals open — close some before opening more'],
  ['Maximum concurrent workflow', 'Too many workflows running — wait for one to finish'],
  ['PTY manager not initialized', 'Terminal system not ready — try again in a moment'],
  ['Invalid sessionId', 'Invalid session — please restart the terminal'],
  ['ENOENT', 'File or folder not found — check the path and try again'],
  ['EACCES', 'Permission denied — check file permissions'],
  ['EPERM', 'Operation not permitted'],
  ['ENOSPC', 'Disk is full — free some space and try again'],
  ['ETIMEDOUT', 'Operation timed out — check your connection and try again'],
] as const

/**
 * Converts a raw IPC error into a user-friendly notification.
 *
 * @param err - The caught error (unknown type from catch blocks)
 * @param context - Optional human-readable context prefix (e.g. "Failed to save project")
 */
export function handleIpcError(err: unknown, context?: string): void {
  const raw = err instanceof Error ? err.message : String(err)

  // Find a user-friendly match
  const match = ERROR_MAP.find(([pattern]) => raw.includes(pattern))
  let displayMessage: string

  if (match) {
    displayMessage = context ? `${context}: ${match[1]}` : match[1]
  } else if (context) {
    displayMessage = `${context} — please try again`
  } else {
    displayMessage = `Something went wrong — please try again`
  }

  useAppStore.getState().addNotification('error', displayMessage)
}
