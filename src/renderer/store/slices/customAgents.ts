import type { StateCreator } from 'zustand'
import type { AppState } from '../appStore'
import { AGENTS } from '../../../shared/agents'
import type { AgentDescriptorWire } from '../../../shared/custom-agents'

export interface CustomAgentsSlice {
  agentRegistry: AgentDescriptorWire[]
  setAgentRegistry: (list: AgentDescriptorWire[]) => void
  bootstrapAgentRegistry: () => Promise<void>
}

/**
 * Built-in agents as renderer-safe descriptors, used to seed the registry so
 * `selectAgentMeta` resolves builtins correctly before the async IPC pull lands
 * (and in tests that don't seed the registry). The main process replaces this
 * with `builtinDescriptors() + custom` on `bootstrapAgentRegistry`.
 */
const BUILTIN_DESCRIPTORS: AgentDescriptorWire[] = AGENTS.map((a) => ({
  id: a.id,
  binary: a.binary,
  name: a.name,
  icon: a.icon,
  short: a.short,
  colorVar: a.colorVar,
  description: a.description,
  contextWindow: a.contextWindow,
  source: 'builtin',
}))

// ── Module-level subscription handles ──────────────────────────────
// Kept outside the store so they don't pollute the serializable state
// shape. `bootstrapAgentRegistry` is idempotent: calling it twice tears
// down the previous subscriptions first.
let registryUnsub: (() => void) | null = null
let parseErrorUnsub: (() => void) | null = null

export const createCustomAgentsSlice: StateCreator<AppState, [], [], CustomAgentsSlice> = (
  set,
  get,
) => ({
  agentRegistry: BUILTIN_DESCRIPTORS,

  setAgentRegistry: (list) => set({ agentRegistry: list }),

  bootstrapAgentRegistry: async () => {
    // Idempotent: tear down any previous subscriptions first.
    if (registryUnsub) {
      registryUnsub()
      registryUnsub = null
    }
    if (parseErrorUnsub) {
      parseErrorUnsub()
      parseErrorUnsub = null
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

    // Surface non-fatal agents.toml parse warnings (skipped/duplicate entries)
    // so a malformed agent doesn't silently vanish — mirrors the templates slice.
    parseErrorUnsub = window.agentDeck.agents.onParseError((e) => {
      for (const warning of e.warnings) {
        window.agentDeck.log.send('warn', 'agents', 'parse error', { warning })
        get().addNotification('warning', `Custom agent skipped: ${warning}`)
      }
    })
  },
})
