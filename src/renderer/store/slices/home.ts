import type { StateCreator } from 'zustand'
import type { AppState } from '../appStore'
import type { GitStatus, ReviewItem, DailyCostEntry } from '../../../shared/types'

export interface HomeSlice {
  // Git status cache
  gitStatuses: Record<string, GitStatus | null>
  setGitStatus: (projectId: string, status: GitStatus | null) => void
  /** Drop entries for project ids no longer in the live set. Called from
   *  ProjectsSlice.setProjects so cache pruning lives next to its owner. */
  pruneGitStatuses: (liveProjectIds: Set<string>) => void

  // Review queue
  reviewItems: ReviewItem[]
  setReviewItems: (items: ReviewItem[]) => void
  dismissReview: (id: string) => void

  // Cost history
  costHistory: DailyCostEntry[]
  setCostHistory: (entries: DailyCostEntry[]) => void
  dailyBudget: number | null
  setDailyBudget: (amount: number | null) => void

  // Tier 3 collapse state
  tier3Collapsed: Record<string, boolean>
  setTier3Collapsed: (key: string, collapsed: boolean) => void
}

export const createHomeSlice: StateCreator<AppState, [], [], HomeSlice> = (set) => ({
  gitStatuses: {},

  setGitStatus: (projectId, status) =>
    set((state) => ({
      gitStatuses: { ...state.gitStatuses, [projectId]: status },
    })),

  pruneGitStatuses: (liveProjectIds) =>
    set((state) => {
      const next: Record<string, GitStatus | null> = {}
      let changed = false
      for (const [id, status] of Object.entries(state.gitStatuses)) {
        if (liveProjectIds.has(id)) next[id] = status
        else changed = true
      }
      return changed ? { gitStatuses: next } : state
    }),

  reviewItems: [],

  setReviewItems: (items) => set({ reviewItems: items }),

  dismissReview: (id) =>
    set((state) => ({
      reviewItems: state.reviewItems.filter((item) => item.id !== id),
    })),

  costHistory: [],

  setCostHistory: (entries) => set({ costHistory: entries }),

  dailyBudget: null,

  setDailyBudget: (amount) => set({ dailyBudget: amount }),

  // Persisted via localStorage so collapse choices survive restarts.
  tier3Collapsed: readTier3Collapsed(),

  setTier3Collapsed: (key, collapsed) =>
    set((state) => {
      const next = { ...state.tier3Collapsed, [key]: collapsed }
      writeTier3Collapsed(next)
      return { tier3Collapsed: next }
    }),
})

const TIER3_COLLAPSED_KEY = 'home.tier3Collapsed'

function readTier3Collapsed(): Record<string, boolean> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(TIER3_COLLAPSED_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function writeTier3Collapsed(value: Record<string, boolean>): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(TIER3_COLLAPSED_KEY, JSON.stringify(value))
  } catch {
    /* quota exceeded or storage disabled — ignore */
  }
}
