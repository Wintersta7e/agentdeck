import type { ReviewItem, ReviewFile } from '../shared/types'

const MAX_REVIEWS = 100

interface AddReviewInput {
  sessionId: string
  agentId: string
  projectId: string
  files: ReviewFile[]
  totalInsertions: number
  totalDeletions: number
}

export interface ReviewTracker {
  addReview: (input: AddReviewInput) => ReviewItem
  dismissReview: (id: string) => void
  getReviews: (projectId: string) => ReviewItem[]
  getAllReviews: () => ReviewItem[]
}

let idCounter = 0

export function createReviewTracker(): ReviewTracker {
  const items = new Map<string, ReviewItem>()

  return {
    addReview(input) {
      const id = `review-${Date.now()}-${++idCounter}`
      const item: ReviewItem = {
        id,
        sessionId: input.sessionId,
        agentId: input.agentId,
        projectId: input.projectId,
        timestamp: Date.now(),
        files: input.files,
        totalInsertions: input.totalInsertions,
        totalDeletions: input.totalDeletions,
        status: 'pending',
      }
      items.set(id, item)
      if (items.size > MAX_REVIEWS) {
        const oldest = items.keys().next().value
        if (oldest !== undefined) items.delete(oldest)
      }
      return item
    },

    dismissReview(id) {
      items.delete(id)
    },

    getReviews(projectId) {
      return Array.from(items.values()).filter((item) => item.projectId === projectId)
    },

    getAllReviews() {
      return Array.from(items.values())
    },
  }
}
