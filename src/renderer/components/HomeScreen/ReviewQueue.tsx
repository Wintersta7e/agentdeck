import { useEffect, useMemo, useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import { AGENTS } from '../../../shared/agents'
import './ReviewQueue.css'

const AGENT_META = new Map<string, (typeof AGENTS)[number]>(AGENTS.map((a) => [a.id, a]))

export function ReviewQueue(): React.JSX.Element {
  const projectIds = useAppStore((s) => s.projects.map((p) => p.id).join(','))
  const reviewItems = useAppStore((s) => s.reviewItems)
  const setReviewItems = useAppStore((s) => s.setReviewItems)
  const dismissReview = useAppStore((s) => s.dismissReview)

  const refetchReviews = useCallback(() => {
    const ids = projectIds ? projectIds.split(',') : []
    if (ids.length === 0) {
      setReviewItems([])
      return
    }
    void Promise.all(
      ids.map((id) => window.agentDeck.home.pendingReviews(id).catch(() => [])),
    ).then((results) => {
      setReviewItems(results.flat())
    })
  }, [projectIds, setReviewItems])

  useEffect(() => {
    refetchReviews()
  }, [refetchReviews])

  useEffect(() => {
    // The signal payload carries an empty array — it's just a poke telling
    // us to refresh from source. Blindly setting items to [] would wipe the
    // queue every time ANY PTY session exits.
    const unsub = window.agentDeck.home.onReviewsUpdated(() => {
      refetchReviews()
    })
    return unsub
  }, [refetchReviews])

  const pending = useMemo(() => reviewItems.filter((r) => r.status === 'pending'), [reviewItems])

  const handleDismiss = useCallback(
    async (id: string) => {
      try {
        await window.agentDeck.home.dismissReview(id)
        dismissReview(id)
      } catch (err) {
        window.agentDeck.log.send('warn', 'review-queue', 'Dismiss failed', {
          reviewId: id,
          err: String(err),
        })
        useAppStore.getState().addNotification('warning', 'Failed to dismiss review')
      }
    },
    [dismissReview],
  )

  return (
    <div className="review-panel">
      <div className="panel-header">{'\uD83D\uDCCB'} Review Queue</div>
      {pending.length === 0 ? (
        <div className="panel-empty">No pending reviews</div>
      ) : (
        pending.map((r) => {
          const meta = AGENT_META.get(r.agentId)
          return (
            <div key={r.id} className="review-item">
              <span className="review-agent">{meta?.name ?? r.agentId}</span>
              <span className="review-diff">
                {r.totalInsertions > 0 && <span className="review-plus">+{r.totalInsertions}</span>}
                {r.totalDeletions > 0 && <span className="review-minus">-{r.totalDeletions}</span>}
              </span>
              <button className="review-btn" type="button">
                Review
              </button>
              <button
                className="review-dismiss"
                onClick={() => void handleDismiss(r.id)}
                type="button"
                aria-label="Dismiss review"
              >
                &times;
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}
