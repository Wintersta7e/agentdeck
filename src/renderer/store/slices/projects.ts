import type { StateCreator } from 'zustand'
import type { AppState } from '../appStore'
import type { Project } from '../../../shared/types'

export interface ProjectsSlice {
  projects: Project[]
  setProjects: (projects: Project[]) => void

  agentStatus: Record<string, boolean>
  setAgentStatus: (status: Record<string, boolean>) => void

  agentVersions: Record<
    string,
    {
      current: string | null
      latest: string | null
      updateAvailable: boolean
      checking: boolean
      updating: boolean
    }
  >
  setAgentVersion: (
    agentId: string,
    info: { current: string | null; latest: string | null; updateAvailable: boolean },
  ) => void
  setAgentUpdating: (agentId: string, updating: boolean) => void

  agentRefreshing: boolean
  refreshAgentStatus: () => Promise<void>

  visibleAgents: string[] | null
  setVisibleAgents: (agents: string[]) => void

  // Cached HomeScreen data (fetched once at startup)
  wslUsername: string
  wslDistro: string
  setWslUsername: (name: string) => void
  setWslDistro: (distro: string) => void
}

export const createProjectsSlice: StateCreator<AppState, [], [], ProjectsSlice> = (set, get) => ({
  projects: [],
  setProjects: (projects) =>
    // Single set call so subscribers see one consistent transition rather
    // than an intermediate state where projects updated but gitStatuses
    // still has entries for deleted projects. Inline the prune calculation
    // — the matching `pruneGitStatuses` action stays on HomeSlice for
    // standalone callers.
    set((state) => {
      const liveIds = new Set(projects.map((p) => p.id))
      const next: typeof state.gitStatuses = {}
      let pruned = false
      for (const [id, status] of Object.entries(state.gitStatuses)) {
        if (liveIds.has(id)) next[id] = status
        else pruned = true
      }
      return pruned ? { projects, gitStatuses: next } : { projects }
    }),

  agentStatus: {},
  setAgentStatus: (status) => set({ agentStatus: status }),
  agentRefreshing: false,
  refreshAgentStatus: async () => {
    set({ agentRefreshing: true })
    try {
      const status = await window.agentDeck.agents.check()
      set({ agentStatus: status })
      // Also trigger version checks for newly-found agents (handles cold-boot retry
      // and manual refresh scenarios where initial check missed agents)
      const hasInstalled = Object.values(status).some((v) => v)
      if (hasInstalled) {
        void window.agentDeck.agents.checkUpdates(status).catch((err: unknown) => {
          window.agentDeck.log.send('warn', 'agents', 'checkUpdates failed', {
            err: String(err),
          })
        })
      }
    } catch (err) {
      get().addNotification('error', 'Failed to detect agents. Is WSL running?')
      window.agentDeck.log.send('warn', 'appStore', 'refreshAgentStatus failed', {
        err: String(err),
      })
    } finally {
      set({ agentRefreshing: false })
    }
  },

  agentVersions: {},

  setAgentVersion: (agentId, info) =>
    set((state) => ({
      agentVersions: {
        ...state.agentVersions,
        [agentId]: {
          ...info,
          checking: false,
          updating: state.agentVersions[agentId]?.updating ?? false,
        },
      },
    })),

  setAgentUpdating: (agentId, updating) =>
    set((state) => {
      const existing = state.agentVersions[agentId]
      if (!existing) return state
      return {
        agentVersions: {
          ...state.agentVersions,
          [agentId]: { ...existing, updating },
        },
      }
    }),

  // Visible Agents
  visibleAgents: null,
  setVisibleAgents: (agents) => {
    window.agentDeck.agents.setVisible(agents).catch((err: unknown) => {
      window.agentDeck.log.send('warn', 'agents', 'setVisible persist failed', {
        err: String(err),
      })
    })
    set({ visibleAgents: agents })
  },

  // Cached HomeScreen data
  wslUsername: '',
  wslDistro: '',
  setWslUsername: (name) => set({ wslUsername: name }),
  setWslDistro: (distro) => set({ wslDistro: distro }),
})
