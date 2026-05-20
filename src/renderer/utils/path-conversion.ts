/**
 * Convert a Windows-style path (e.g. `C:\foo\bar` or `C:/foo/bar`) to a WSL
 * POSIX path (e.g. `/mnt/c/foo/bar`). Leaves WSL paths and unrecognised
 * strings untouched so callers can pass either format.
 *
 * The Electron folder picker returns native Windows paths even when the app
 * targets WSL, so renderer entry points (PathInput, WorkflowRunDialog) must
 * normalise before persisting — otherwise IPC handlers that validate POSIX
 * paths (`files:listDir`, etc.) reject the value.
 */
export function windowsToWsl(input: string): string {
  return input
    .replace(/^([A-Za-z]):[/\\]/, (_, d: string) => `/mnt/${d.toLowerCase()}/`)
    .replace(/\\/g, '/')
}
