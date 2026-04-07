import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import type { WorkflowRun } from '../../shared/types'

export function useRecentWorkflowRuns(limit = 3): WorkflowRun[] {
  const workflowIds = useAppStore((s) => s.workflows.map((w) => w.id).join(','))
  const [runs, setRuns] = useState<WorkflowRun[]>([])

  useEffect(() => {
    let cancelled = false
    const ids = workflowIds ? workflowIds.split(',') : []

    void Promise.all(
      ids.map((id) => window.agentDeck.workflows.listRuns(id).catch(() => [] as WorkflowRun[])),
    ).then((results) => {
      if (cancelled) return
      const all = results
        .flat()
        .sort((a, b) => b.startedAt - a.startedAt)
        .slice(0, limit)
      setRuns(all)
    })

    return () => {
      cancelled = true
    }
  }, [workflowIds, limit])

  return runs
}
