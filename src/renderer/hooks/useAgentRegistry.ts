import type { AgentDescriptorWire } from '../../shared/custom-agents'
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
