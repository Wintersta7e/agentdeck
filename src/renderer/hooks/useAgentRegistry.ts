import type { AgentDescriptorWire } from '../../shared/custom-agents'
import { selectAgentMeta, type AgentMeta } from '../utils/agent-ui'
import { useAppStore } from '../store/appStore'

/**
 * Returns the live agent registry (built-in + custom) from the store.
 *
 * The slice stores the registry as a single array reference (replaced wholesale
 * on each pull), so a plain identity selector is stable — no `useShallow`.
 */
export function useAgentRegistry(): AgentDescriptorWire[] {
  return useAppStore((s) => s.agentRegistry)
}

/**
 * Resolve display metadata for a single agent id against the live registry.
 *
 * Convenience wrapper over `useAgentRegistry` + `selectAgentMeta` for the common
 * top-level case. Inside `.map()`/loops a hook is illegal — call
 * `selectAgentMeta(registry, id)` directly there.
 */
export function useAgentMeta(id: string): AgentMeta {
  return selectAgentMeta(useAgentRegistry(), id)
}
