import { describe, it, expect, beforeEach } from 'vitest'
import { createReviewTracker } from '../review-tracker'

describe('ReviewTracker', () => {
  let tracker: ReturnType<typeof createReviewTracker>

  beforeEach(() => {
    tracker = createReviewTracker()
  })

  it('adds a review item', () => {
    tracker.addReview({
      sessionId: 's1',
      agentId: 'claude-code',
      projectId: 'proj-1',
      files: [{ path: 'src/auth.ts', insertions: 10, deletions: 2, status: 'added' }],
      totalInsertions: 10,
      totalDeletions: 2,
    })

    const items = tracker.getReviews('proj-1')
    expect(items).toHaveLength(1)
    expect(items[0]?.status).toBe('pending')
    expect(items[0]?.agentId).toBe('claude-code')
  })

  it('dismisses a review item', () => {
    tracker.addReview({
      sessionId: 's1',
      agentId: 'claude-code',
      projectId: 'proj-1',
      files: [],
      totalInsertions: 0,
      totalDeletions: 0,
    })

    const items = tracker.getReviews('proj-1')
    const id = items[0]?.id
    expect(id).toBeDefined()
    tracker.dismissReview(id!)

    const updated = tracker.getReviews('proj-1')
    expect(updated[0]?.status).toBe('dismissed')
  })

  it('returns all reviews across projects', () => {
    tracker.addReview({
      sessionId: 's1',
      agentId: 'claude-code',
      projectId: 'proj-1',
      files: [],
      totalInsertions: 5,
      totalDeletions: 0,
    })
    tracker.addReview({
      sessionId: 's2',
      agentId: 'codex',
      projectId: 'proj-2',
      files: [],
      totalInsertions: 10,
      totalDeletions: 3,
    })

    const all = tracker.getAllReviews()
    expect(all).toHaveLength(2)
  })
})
