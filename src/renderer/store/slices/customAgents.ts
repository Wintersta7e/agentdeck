import type { StateCreator } from 'zustand'
import type { AppState } from '../appStore'
import type { AgentDescriptorWire } from '../../../shared/custom-agents'

export interface CustomAgentsSlice {
  agentRegistry: AgentDescriptorWire[]
  setAgentRegistry: (list: AgentDescriptorWire[]) => void
  bootstrapAgentRegistry: () => Promise<void>
}

// ── Module-level subscription handle ───────────────────────────────
// Kept outside the store so it doesn't pollute the serializable state
// shape. `bootstrapAgentRegistry` is idempotent: calling it twice tears
// down the previous subscription first.
let registryUnsub: (() => void) | null = null

export const createCustomAgentsSlice: StateCreator<AppState, [], [], CustomAgentsSlice> = (
  set,
) => ({
  agentRegistry: [],

  setAgentRegistry: (list) => set({ agentRegistry: list }),

  bootstrapAgentRegistry: async () => {
    // Idempotent: tear down any previous subscription first.
    if (registryUnsub) {
      registryUnsub()
      registryUnsub = null
    }

    try {
      const registry = await window.agentDeck.agents.getRegistry()
      set({ agentRegistry: registry })
    } catch (err) {
      window.agentDeck.log.send('warn', 'agents', 'bootstrap getRegistry failed', {
        err: String(err),
      })
    }

    registryUnsub = window.agentDeck.agents.onRegistryChange(() => {
      void window.agentDeck.agents
        .getRegistry()
        .then((registry) => set({ agentRegistry: registry }))
        .catch((err: unknown) => {
          window.agentDeck.log.send('warn', 'agents', 'registry re-pull failed', {
            err: String(err),
          })
        })
    })
  },
})
