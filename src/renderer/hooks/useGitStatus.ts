import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'

const REFRESH_MS = 30_000
const MAX_CONCURRENT = 4

/** Fetches git status for all provided project IDs in parallel batches */
export function useGitStatusBatch(projectIds: string[]): void {
  const setGitStatus = useAppStore((s) => s.setGitStatus)
  const idsRef = useRef(projectIds)

  // Keep the ref current without triggering re-renders
  useEffect(() => {
    idsRef.current = projectIds
  })

  useEffect(() => {
    let cancelled = false

    async function fetchAll(): Promise<void> {
      const ids = [...idsRef.current]
      // Process in parallel batches of MAX_CONCURRENT
      for (let i = 0; i < ids.length; i += MAX_CONCURRENT) {
        if (cancelled) return
        const batch = ids.slice(i, i + MAX_CONCURRENT)
        const results = await Promise.allSettled(
          batch.map((id) => window.agentDeck.home.gitStatus(id).then((status) => ({ id, status }))),
        )
        for (const result of results) {
          if (cancelled) return
          if (result.status === 'fulfilled') {
            setGitStatus(result.value.id, result.value.status)
          }
        }
      }
    }

    void fetchAll()
    const interval = setInterval(() => void fetchAll(), REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [setGitStatus]) // stable dep — project list read from ref
}
