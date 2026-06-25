import { useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../store/appStore'
import { USAGE_REFRESH_INTERVAL_MS } from '../../shared/constants'
import { usePollEffect } from './usePollEffect'

const MAX_CONCURRENT = 4

/** Fetches git status for all provided project IDs in parallel batches */
export function useGitStatusBatch(projectIds: string[]): void {
  const setGitStatus = useAppStore((s) => s.setGitStatus)
  const idsRef = useRef(projectIds)

  // Keep the ref current without triggering re-renders
  useEffect(() => {
    idsRef.current = projectIds
  })

  const fetchAll = useCallback(
    async (isActive: () => boolean) => {
      const ids = [...idsRef.current]
      // Process in parallel batches of MAX_CONCURRENT
      for (let i = 0; i < ids.length; i += MAX_CONCURRENT) {
        if (!isActive()) return
        const batch = ids.slice(i, i + MAX_CONCURRENT)
        const results = await Promise.allSettled(
          batch.map((id) => window.agentDeck.home.gitStatus(id).then((status) => ({ id, status }))),
        )
        for (const result of results) {
          if (!isActive()) return
          if (result.status === 'fulfilled') {
            setGitStatus(result.value.id, result.value.status)
          }
        }
      }
    },
    [setGitStatus], // project list read from ref
  )
  usePollEffect(fetchAll, USAGE_REFRESH_INTERVAL_MS)
}
