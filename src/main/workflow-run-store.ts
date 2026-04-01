import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { createLogger } from './logger'
import type { WorkflowRun } from '../shared/types'
import { SAFE_ID_RE } from './validation'

const log = createLogger('workflow-run-store')
const MAX_RUNS_PER_WORKFLOW = 20

/** Validate id is safe for filesystem use. */
function safeId(id: string): string {
  if (!id || !SAFE_ID_RE.test(id)) {
    throw new Error(`Invalid id for filesystem use: ${id}`)
  }
  return id
}

/** Cache the runs directory path after first creation. */
let cachedRunsDir: string | null = null

function getRunsDir(): string {
  if (cachedRunsDir) return cachedRunsDir
  const dir = path.join(app.getPath('userData'), 'workflow-runs')
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (err) {
    log.error('Failed to create workflow-runs directory', { err: String(err) })
    throw new Error('Failed to create workflow-runs storage directory')
  }
  cachedRunsDir = dir
  return dir
}

/** WF-8: Per-workflow write locks to prevent saveRun + pruneRuns races. */
const writeLocks = new Map<string, Promise<void>>()

/**
 * Build a deterministic filename from workflow ID, startedAt timestamp, and run ID.
 * WF-9: Including run ID enables O(1) deletion by filename instead of scanning all files.
 */
function runFilename(workflowId: string, startedAt: number, runId: string): string {
  return `${safeId(workflowId)}_${startedAt}_${safeId(runId)}.json`
}

/** Save a completed workflow run to disk. Auto-prunes old runs. */
export async function saveRun(run: WorkflowRun): Promise<void> {
  // WF-8: Chain onto any pending write for this workflow to prevent races
  const prev = writeLocks.get(run.workflowId) ?? Promise.resolve()
  const task = prev
    .catch(() => {})
    .then(async () => {
      const dir = getRunsDir()
      const filename = runFilename(run.workflowId, run.startedAt, run.id)
      const file = path.join(dir, filename)
      const tmpFile = file + '.tmp'

      // Atomic write: write to .tmp, then rename
      await fs.promises.writeFile(tmpFile, JSON.stringify(run, null, 2), 'utf-8')
      await fs.promises.rename(tmpFile, file)

      log.info('Workflow run saved', { id: run.id, workflowId: run.workflowId })

      // Prune: keep only the most recent MAX_RUNS_PER_WORKFLOW files per workflow
      await pruneRuns(run.workflowId)
    })
  writeLocks.set(run.workflowId, task)
  try {
    await task
  } finally {
    if (writeLocks.get(run.workflowId) === task) writeLocks.delete(run.workflowId)
  }
}

/** Remove oldest run files beyond the retention limit. */
async function pruneRuns(workflowId: string): Promise<void> {
  const dir = getRunsDir()
  const prefix = `${safeId(workflowId)}_`

  let files: string[]
  try {
    const allFiles = await fs.promises.readdir(dir)
    files = allFiles.filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
  } catch {
    return
  }

  if (files.length <= MAX_RUNS_PER_WORKFLOW) return

  // PERF-12: Sort by timestamp embedded in filename instead of calling stat() on each file.
  // Filename format: ${workflowId}_${startedAt}_${runId}.json — startedAt is the 2nd segment.
  const withTimestamp = files.map((f) => {
    const ts = parseInt(f.split('_')[1] ?? '0', 10)
    return { file: f, ts: Number.isFinite(ts) ? ts : 0 }
  })
  withTimestamp.sort((a, b) => b.ts - a.ts)

  // Delete everything beyond the retention limit
  const toDelete = withTimestamp.slice(MAX_RUNS_PER_WORKFLOW)
  for (const entry of toDelete) {
    try {
      await fs.promises.rm(path.join(dir, entry.file), { force: true })
      log.info('Pruned old workflow run', { file: entry.file })
    } catch (err) {
      log.warn('Failed to prune workflow run file', { file: entry.file, err: String(err) })
    }
  }
}

/** List all runs for a workflow, sorted newest first. */
export async function listRuns(workflowId: string): Promise<WorkflowRun[]> {
  const dir = getRunsDir()
  const prefix = `${safeId(workflowId)}_`

  let allFiles: string[]
  try {
    allFiles = await fs.promises.readdir(dir)
  } catch {
    return []
  }

  const jsonFiles = allFiles.filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
  const runs: WorkflowRun[] = []

  for (const f of jsonFiles) {
    try {
      const raw = await fs.promises.readFile(path.join(dir, f), 'utf-8')
      const parsed = JSON.parse(raw) as WorkflowRun
      runs.push(parsed)
    } catch (err) {
      log.warn('Failed to parse workflow run file', { file: f, err: String(err) })
    }
  }

  // Sort by startedAt descending (newest first)
  runs.sort((a, b) => b.startedAt - a.startedAt)
  return runs
}

/** Delete a specific run by ID. WF-9: Finds file by run ID in filename instead of parsing all. */
export async function deleteRun(runId: string): Promise<void> {
  safeId(runId)
  const dir = getRunsDir()

  let allFiles: string[]
  try {
    allFiles = await fs.promises.readdir(dir)
  } catch {
    return
  }

  // WF-9: Run ID is embedded in filename as the last segment before .json
  const suffix = `_${runId}.json`
  const target = allFiles.find((f) => f.endsWith(suffix))
  if (target) {
    await fs.promises.rm(path.join(dir, target), { force: true })
    log.info('Workflow run deleted', { runId, file: target })
  } else {
    log.info('Workflow run not found for deletion', { runId })
  }
}
