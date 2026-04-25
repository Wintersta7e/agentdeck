import type { AgentEnvSnapshot } from '../shared/types'
import { KNOWN_AGENT_IDS } from '../shared/agents'
import { readClaudeSnapshot } from './agent-env-claude'
import { readCodexSnapshot } from './agent-env-codex'
import { readOtherAgentSnapshot } from './agent-env-other'
import { createLogger } from './logger'

const log = createLogger('agent-env-resolver')

const TTL_MS = 30_000

interface CacheEntry {
  snapshot: AgentEnvSnapshot
  timestamp: number
}

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<AgentEnvSnapshot>>()

export interface GetSnapshotOpts {
  agentId: string
  projectPath?: string | undefined
  force?: boolean | undefined
}

export async function getAgentSnapshot(opts: GetSnapshotOpts): Promise<AgentEnvSnapshot> {
  const { agentId, projectPath, force = false } = opts
  if (!KNOWN_AGENT_IDS.has(agentId)) {
    throw new Error(`unknown agent: ${agentId}`)
  }

  const key = `${agentId}:${projectPath ?? ''}`

  if (!force) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.timestamp < TTL_MS) {
      return hit.snapshot
    }
    const inFlightPromise = inFlight.get(key)
    if (inFlightPromise) return inFlightPromise
  }

  const promise = (async (): Promise<AgentEnvSnapshot> => {
    log.info('resolving agent snapshot', { agentId, projectPath, force })
    let snapshot: AgentEnvSnapshot
    if (agentId === 'claude-code') {
      snapshot = await readClaudeSnapshot({ projectPath })
    } else if (agentId === 'codex') {
      snapshot = await readCodexSnapshot({ projectPath })
    } else {
      snapshot = await readOtherAgentSnapshot({ agentId, projectPath })
    }
    cache.set(key, { snapshot, timestamp: Date.now() })
    return snapshot
  })()

  inFlight.set(key, promise)
  try {
    return await promise
  } finally {
    inFlight.delete(key)
  }
}

export function invalidateSnapshotCache(): void {
  cache.clear()
  inFlight.clear()
}
