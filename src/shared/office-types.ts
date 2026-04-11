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

// Reuse the canonical agent union from the existing registry.
import type { AgentId } from './agents'

export type WorkerActivity =
  | 'spawning' // walking from door to assigned desk
  | 'working' // recent raw PTY output
  | 'idle-coffee' // 2 min no raw PTY output
  | 'idle-window' // 5 min+ no raw PTY output

export interface OfficeWorker {
  /** Stable key, identical to the live PTY sessionId. */
  id: string
  agentId: AgentId
  projectId: string
  projectName: string
  sessionLabel: string
  startedAtEpoch: number
  startedAtMono: number
  /** Assigned bullpen desk index 0..19, stable for the session's lifetime. */
  deskIndex: number
  activity: WorkerActivity
  /** Monotonic ms since last raw PTY data event. 0 when currently working. */
  idleMs: number
  costUsd: number
}

export interface OfficeSnapshot {
  /** Monotonic ms when snapshot was built. Debug only. */
  monotonicAt: number
  /** Sorted by startedAtMono asc, then id asc. Deterministic diffs. */
  workers: OfficeWorker[]
}

/** Injected clock for deterministic tests. Production uses performance.now. */
export interface Clock {
  now(): number
}

/** Injected ticker for deterministic tests. Production uses setTimeout. */
export interface Ticker {
  schedule(cb: () => void, delayMs: number): () => void
}

/** Reserved for V2 meeting scheduler. Not used in V1. */
export interface Rng {
  next(): number
}
