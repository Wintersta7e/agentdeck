import * as fs from 'fs'
import * as path from 'path'
import { randomBytes } from 'node:crypto'
import { app } from 'electron'
import { createLogger } from './logger'
import { validateWorkflow } from '../shared/workflow-utils'
import type { Workflow, WorkflowMeta } from '../shared/types'

const log = createLogger('workflow-store')

/** Validate id is safe for filesystem use — reject anything with non-alphanumeric chars */
function safeId(id: string): string {
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid workflow id for filesystem use: ${id}`)
  }
  return id
}

// M4: Cache workflows directory path
let cachedWorkflowsDir: string | null = null

export function getWorkflowsDir(): string {
  if (cachedWorkflowsDir) return cachedWorkflowsDir
  const dir = path.join(app.getPath('userData'), 'workflows')
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (err) {
    log.error('Failed to create workflows directory', { err: String(err) })
    throw new Error('Failed to create workflows storage directory')
  }
  cachedWorkflowsDir = dir
  return dir
}

// M2: Per-workflow write lock to prevent concurrent saves
const writeLocks = new Map<string, Promise<Workflow>>()

// H4: Async versions of all workflow operations

export async function listWorkflows(): Promise<WorkflowMeta[]> {
  const dir = getWorkflowsDir()
  const files = await fs.promises.readdir(dir)
  const jsonFiles = files.filter((f) => f.endsWith('.json'))
  // PERF-11: Read all workflow files concurrently instead of sequentially
  const results = await Promise.all(
    jsonFiles.map(async (f) => {
      try {
        const raw = JSON.parse(await fs.promises.readFile(path.join(dir, f), 'utf-8')) as Workflow
        const meta: WorkflowMeta = {
          id: raw.id,
          name: raw.name,
          nodeCount: raw.nodes?.length ?? 0,
          updatedAt: raw.updatedAt,
        }
        if (raw.description !== undefined) meta.description = raw.description
        return meta
      } catch (err) {
        log.warn('Failed to parse workflow file', { file: f, err: String(err) })
        return null
      }
    }),
  )
  return results.filter((m): m is WorkflowMeta => m !== null)
}

export async function loadWorkflow(id: string): Promise<Workflow | null> {
  try {
    const file = path.join(getWorkflowsDir(), `${safeId(id)}.json`)
    const data = await fs.promises.readFile(file, 'utf-8')
    return JSON.parse(data) as Workflow
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      log.error('Failed to load workflow', { id, err: String(err) })
    }
    return null
  }
}

export async function saveWorkflow(workflow: Workflow): Promise<Workflow> {
  const id = workflow.id || crypto.randomUUID()

  const doActualSave = async (): Promise<Workflow> => {
    const now = Date.now()
    const w: Workflow = {
      ...workflow,
      updatedAt: now,
      createdAt: workflow.createdAt || now,
      id,
    }

    // C2: Validate before persisting to disk
    const validation = validateWorkflow(w)
    if (validation.errors.length > 0) {
      throw new Error(`Invalid workflow: ${validation.errors.join('; ')}`)
    }

    // H5: Atomic write — write to .tmp then rename
    const file = path.join(getWorkflowsDir(), `${safeId(w.id)}.json`)
    const tmpFile = `${file}.${randomBytes(6).toString('hex')}.tmp`
    await fs.promises.writeFile(tmpFile, JSON.stringify(w, null, 2), 'utf-8')
    await fs.promises.rename(tmpFile, file)

    log.info('Workflow saved', { id: w.id, name: w.name })
    return w
  }

  // Chain onto any pending write for this ID to prevent concurrent writes
  const existing = writeLocks.get(id) ?? Promise.resolve(null as Workflow | null)
  const p = existing.catch(() => {}).then(() => doActualSave())
  writeLocks.set(id, p)
  try {
    return await p
  } finally {
    if (writeLocks.get(id) === p) writeLocks.delete(id)
  }
}

export async function renameWorkflow(id: string, name: string): Promise<void> {
  const wf = await loadWorkflow(id)
  if (!wf) {
    log.warn('Cannot rename — workflow not found', { id })
    throw new Error(`Workflow not found: ${id}`)
  }
  wf.name = name
  wf.updatedAt = Date.now()
  await saveWorkflow(wf)
  log.info('Workflow renamed', { id, name })
}

export async function deleteWorkflow(id: string): Promise<void> {
  const file = path.join(getWorkflowsDir(), `${safeId(id)}.json`)
  await fs.promises.rm(file, { force: true })
  log.info('Workflow deleted', { id })
}
