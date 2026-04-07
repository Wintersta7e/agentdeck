import { useEffect, useMemo, useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import { AGENTS } from '../../../shared/agents'
import './ReviewQueue.css'

const AGENT_META = new Map<string, (typeof AGENTS)[number]>(AGENTS.map((a) => [a.id, a]))

export function ReviewQueue(): React.JSX.Element {
  const projects = useAppStore((s) => s.projects)
  const reviewItems = useAppStore((s) => s.reviewItems)
  const setReviewItems = useAppStore((s) => s.setReviewItems)
  const dismissReview = useAppStore((s) => s.dismissReview)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      const allItems = []
      for (const p of projects) {
        try {
          const items = await window.agentDeck.home.pendingReviews(p.id)
          allItems.push(...items)
        } catch {
          // Ignore IPC errors for individual projects
        }
      }
      if (!cancelled) setReviewItems(allItems)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [projects, setReviewItems])

  const pending = useMemo(() => reviewItems.filter((r) => r.status === 'pending'), [reviewItems])

  const handleDismiss = useCallback(
    async (id: string) => {
      try {
        await window.agentDeck.home.dismissReview(id)
        dismissReview(id)
      } catch {
        // Ignore
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
