import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import type { WorkflowRun } from '../../shared/types'

export function useRecentWorkflowRuns(limit = 3): WorkflowRun[] {
  const workflowIds = useAppStore((s) => s.workflows.map((w) => w.id).join(','))
  const [runs, setRuns] = useState<WorkflowRun[]>([])

  // Track workflow execution status changes — re-fetch when a workflow finishes
  const workflowStatuses = useAppStore((s) => {
    const entries = Object.entries(s.workflowStatuses)
    return entries.map(([id, status]) => `${id}:${status}`).join(',')
  })

  useEffect(() => {
    let cancelled = false
    const ids = workflowIds ? workflowIds.split(',') : []

    function fetchRuns(): void {
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
    }

    fetchRuns()

    return () => {
      cancelled = true
    }
  }, [workflowIds, workflowStatuses, limit])

  return runs
}
