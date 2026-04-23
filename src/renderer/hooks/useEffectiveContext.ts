import { useEffect, useState } from 'react'
import type { ContextResult } from '../../shared/context-types'

interface HookState {
  loading: boolean
  value: number | null
  source: ContextResult['source'] | null
  modelId: string | null
  unknownModelHint: string | undefined
}

const INITIAL: HookState = {
  loading: true,
  value: null,
  source: null,
  modelId: null,
  unknownModelHint: undefined,
}

/**
 * Primary hook: auto-detects the active model for an agent and returns the
 * resolver's verdict (value + source + modelId).
 */
export function useEffectiveContext(agentId: string): HookState {
  const [state, setState] = useState<HookState>(INITIAL)
  useEffect(() => {
    let cancelled = false
    window.agentDeck.agents.getEffectiveContext(agentId).then((r) => {
      if (cancelled) return
      if ('error' in r) {
        setState({
          loading: false,
          value: null,
          source: null,
          modelId: null,
          unknownModelHint: undefined,
        })
        return
      }
      setState({
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
  }, [agentId])
  return state
}

/**
 * Fallback-only hook: for pre-v6.0.1 sessions that lack a stored resolved
 * snapshot but still carry a `model` field. Runs no detector — skips the
 * detector/cache path entirely. Calls the IPC that passes the explicit
 * modelId directly to the resolver.
 */
export function useEffectiveContextForModel(agentId: string, modelId: string): HookState {
  const [state, setState] = useState<HookState>(INITIAL)
  useEffect(() => {
    let cancelled = false
    window.agentDeck.agents.getEffectiveContextForModel(agentId, modelId).then((r) => {
      if (cancelled) return
      if ('error' in r) {
        setState({
          loading: false,
          value: null,
          source: null,
          modelId: null,
          unknownModelHint: undefined,
        })
        return
      }
      setState({
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
  }, [agentId, modelId])
  return state
}
