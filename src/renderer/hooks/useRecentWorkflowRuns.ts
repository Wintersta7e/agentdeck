import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import type { WorkflowRun } from '../../shared/types'

export function useRecentWorkflowRuns(limit = 3): WorkflowRun[] {
  const workflows = useAppStore((s) => s.workflows)
  const [runs, setRuns] = useState<WorkflowRun[]>([])

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      const allRuns: WorkflowRun[] = []
      for (const wf of workflows) {
        try {
          const wfRuns = await window.agentDeck.workflows.listRuns(wf.id)
          allRuns.push(...wfRuns)
        } catch {
          // Ignore per-workflow errors
        }
      }
      if (!cancelled) {
        const sorted = allRuns.sort((a, b) => b.startedAt - a.startedAt).slice(0, limit)
        setRuns(sorted)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [workflows, limit])

  return runs
}
