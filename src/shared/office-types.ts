/**
 * Types shared between main process (pty-manager, office registry/aggregator)
 * and the office renderer window. See docs/superpowers/specs/2026-04-09-3d-office-design.md.
 */

export interface PtySpawnSuccessEvent {
  sessionId: string
  agent: string // canonical agent name, already resolved by pty-manager
  projectPath: string | undefined // undefined for terminal-only sessions
  startedAtEpoch: number // Date.now() at emission
  startedAtMono: number // performance.now() at emission
}

export interface PtySpawnFailedEvent {
  sessionId: string
  reason: string // String(err) for diagnostics
}
