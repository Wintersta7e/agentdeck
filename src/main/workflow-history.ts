/**
 * Workflow run history recording.
 *
 * Extracted from workflow-engine.ts to separate run-recording concerns
 * from orchestration logic. The RunRecorder encapsulates the WorkflowRun
 * stub, node recording, and finalization + disk persistence.
 */
import { createLogger } from './logger'
import { stripAnsi } from './node-runners'
import { saveRun } from './workflow-run-store'
import type { Workflow, WorkflowRun, WorkflowNodeRun, WorkflowStatus } from '../shared/types'

const log = createLogger('workflow-history')

/** Extract the last N non-empty lines from agent output for error diagnostics. */
export function getErrorTail(output: string | undefined, maxLines = 50): string[] | undefined {
  if (!output) return undefined
  const lines = stripAnsi(output)
    .split('\n')
    .filter((l) => l.trim())
  return lines.length > 0 ? lines.slice(-maxLines) : undefined
}

export interface RunRecorder {
  /** Append a node execution record. */
  recordNode(entry: WorkflowNodeRun): void
  /** Mark the run as finished and persist to disk. */
  finalize(status: WorkflowStatus): void
}

export function createRunRecorder(
  workflow: Workflow,
  projectPath: string | undefined,
  variables: Record<string, string>,
): RunRecorder {
  const run: WorkflowRun = {
    id: crypto.randomUUID(),
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: 'running',
    startedAt: Date.now(),
    finishedAt: null,
    durationMs: null,
    projectPath: projectPath ?? null,
    variables,
    nodes: [],
  }

  return {
    recordNode(entry: WorkflowNodeRun): void {
      run.nodes.push(entry)
    },

    finalize(status: WorkflowStatus): void {
      run.status = status
      run.finishedAt = Date.now()
      run.durationMs = run.finishedAt - run.startedAt
      saveRun(run).catch((err: unknown) => {
        log.warn('Failed to save workflow run history', {
          workflowId: workflow.id,
          err: String(err),
        })
      })
    },
  }
}
