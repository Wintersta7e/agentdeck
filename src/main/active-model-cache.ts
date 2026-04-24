import type { AgentType } from '../shared/types'
import type { DetectorOutput } from './active-model-detectors'
import { DETECTORS } from './active-model-detectors'

const TTL_MS = 30_000

interface CacheEntry {
  detector: DetectorOutput
  expiresAt: number
  requestSeq: number
  generation: number
}

const cache = new Map<AgentType, CacheEntry>()
const inFlight = new Map<AgentType, Promise<DetectorOutput>>()
let nextSeq = 0
let currentGeneration = 0

interface ResolveOpts {
  forceRefresh?: boolean
}

/**
 * Resolve the active model for an agent. Cached for 30s. Concurrent callers
 * share one underlying read via inFlight. `forceRefresh: true` bypasses both
 * the TTL cache and inFlight, starting its own read, and wins any race via
 * freshness-ordered writes (`requestSeq` minted before I/O).
 */
export async function resolveActiveModel(
  agentId: AgentType,
  opts: ResolveOpts = {},
): Promise<DetectorOutput> {
  const reader = DETECTORS[agentId]
  if (!reader) return { modelId: null }

  if (opts.forceRefresh) {
    const seq = ++nextSeq
    const gen = currentGeneration
    const out = await reader()
    commitIfFresh(agentId, out, seq, gen)
    return out
  }

  const hit = cache.get(agentId)
  if (hit && hit.expiresAt > Date.now() && hit.generation === currentGeneration) {
    return hit.detector
  }

  const existing = inFlight.get(agentId)
  if (existing) return existing

  const seq = ++nextSeq
  const gen = currentGeneration
  const promise = reader()
    .then((out) => {
      commitIfFresh(agentId, out, seq, gen)
      inFlight.delete(agentId)
      return out
    })
    .catch((err: unknown) => {
      inFlight.delete(agentId)
      throw err
    })
  inFlight.set(agentId, promise)
  return promise
}

function commitIfFresh(
  agentId: AgentType,
  detector: DetectorOutput,
  seq: number,
  gen: number,
): void {
  // Drop pre-invalidation reads.
  if (gen !== currentGeneration) return
  // Freshness-ordered: an earlier-started read cannot overwrite a later one.
  const existing = cache.get(agentId)
  if (existing && existing.requestSeq >= seq) return
  cache.set(agentId, {
    detector,
    expiresAt: Date.now() + TTL_MS,
    requestSeq: seq,
    generation: currentGeneration,
  })
}

/**
 * Invalidate the entire cache. Used when detector-affecting environment
 * may have changed (e.g. `agents:check` refresh after a CLI install).
 * Increments generation so any pre-invalidation in-flight reads resolve
 * their promise to their original caller but cannot repopulate the cache.
 * Clears inFlight so no NEW caller can piggyback those reads.
 */
export function invalidateAll(): void {
  currentGeneration++
  cache.clear()
  inFlight.clear()
}

// Test-only reset.
export function __resetCacheForTests(): void {
  cache.clear()
  inFlight.clear()
  nextSeq = 0
  currentGeneration = 0
}
