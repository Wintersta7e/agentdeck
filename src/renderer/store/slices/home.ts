import type { StateCreator } from 'zustand'
import type { AppState } from '../appStore'
import type { GitStatus, ReviewItem, DailyCostEntry } from '../../../shared/types'

export interface HomeSlice {
  // Git status cache
  gitStatuses: Record<string, GitStatus | null>
  setGitStatus: (projectId: string, status: GitStatus | null) => void

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

  tier3Collapsed: {},

  setTier3Collapsed: (key, collapsed) =>
    set((state) => ({
      tier3Collapsed: { ...state.tier3Collapsed, [key]: collapsed },
    })),
})
