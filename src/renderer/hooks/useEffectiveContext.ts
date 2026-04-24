import { useEffect, useState } from 'react'
import type { ContextResult } from '../../shared/context-types'
import type { ContextSource } from '../../shared/types'

interface HookState {
  loading: boolean
  value: number | null
  source: ContextResult['source'] | null
  modelId: string | null
  unknownModelHint: string | undefined
}

interface HookOpts {
  enabled?: boolean
}

const INITIAL: HookState = {
  loading: true,
  value: null,
  source: null,
  modelId: null,
  unknownModelHint: undefined,
}

const DISABLED: HookState = {
  loading: false,
  value: null,
  source: null,
  modelId: null,
  unknownModelHint: undefined,
}

export function badgeLabelFor(
  source: ContextSource | null,
  modelId: string | null,
): 'override' | 'auto' | '?' | '(default)' | null {
  if (!source) return null
  if (source === 'override-model' || source === 'override-agent') return 'override'
  if (
    source === 'cli-context-override' ||
    source === 'registry-exact' ||
    source === 'registry-pattern' ||
    source === 'heuristic'
  )
    return 'auto'
  // source === 'default'
  return modelId !== null ? '?' : '(default)'
}

/**
 * Primary hook: auto-detects the active model for an agent and returns the
 * resolver's verdict (value + source + modelId).
 *
 * Pass `{ enabled: false }` to skip the IPC call entirely (e.g. when a stored
 * launch snapshot is already available). The hook still respects Rules of Hooks
 * — the effect runs unconditionally but exits early without calling setState.
 */
export function useEffectiveContext(agentId: string, opts: HookOpts = {}): HookState {
  const { enabled = true } = opts
  const [asyncState, setAsyncState] = useState<HookState | null>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    window.agentDeck.agents.getEffectiveContext(agentId).then((r) => {
      if (cancelled) return
      if ('error' in r) {
        setAsyncState({
          loading: false,
          value: null,
          source: null,
          modelId: null,
          unknownModelHint: undefined,
        })
        return
      }
      setAsyncState({
        loading: false,
        value: r.value,
        source: r.source,
        modelId: r.modelId,
        unknownModelHint: r.unknownModelHint,
      })
    })
    return () => {
      cancelled = true
    }
  }, [agentId, enabled])
  // When disabled, always return the DISABLED shape regardless of any stale async state.
  if (!enabled) return DISABLED
  // When enabled but no result yet, return INITIAL (loading).
  return asyncState ?? INITIAL
}

/**
 * Fallback-only hook: for pre-v6.0.1 sessions that lack a stored resolved
 * snapshot but still carry a `model` field. Runs no detector — skips the
 * detector/cache path entirely. Calls the IPC that passes the explicit
 * modelId directly to the resolver.
 *
 * Pass `{ enabled: false }` to skip the IPC call entirely.
 */
export function useEffectiveContextForModel(
  agentId: string,
  modelId: string,
  opts: HookOpts = {},
): HookState {
  const { enabled = true } = opts
  const [asyncState, setAsyncState] = useState<HookState | null>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    window.agentDeck.agents.getEffectiveContextForModel(agentId, modelId).then((r) => {
      if (cancelled) return
      if ('error' in r) {
        setAsyncState({
          loading: false,
          value: null,
          source: null,
          modelId: null,
          unknownModelHint: undefined,
        })
        return
      }
      setAsyncState({
        loading: false,
        value: r.value,
        source: r.source,
        modelId: r.modelId,
        unknownModelHint: r.unknownModelHint,
      })
    })
    return () => {
      cancelled = true
    }
  }, [agentId, modelId, enabled])
  if (!enabled) return DISABLED
  return asyncState ?? INITIAL
}
