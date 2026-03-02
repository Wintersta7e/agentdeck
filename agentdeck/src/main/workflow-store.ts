import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { createLogger } from './logger'
import type { Workflow, WorkflowMeta } from '../shared/types'

const log = createLogger('workflow-store')

/** Strip path separators and relative components to prevent path traversal */
function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '')
}

// M4: Cache workflows directory path
let cachedWorkflowsDir: string | null = null

function getWorkflowsDir(): string {
  if (cachedWorkflowsDir) return cachedWorkflowsDir
  const dir = path.join(app.getPath('userData'), 'workflows')
  fs.mkdirSync(dir, { recursive: true })
  cachedWorkflowsDir = dir
  return dir
}

// H4: Async versions of all workflow operations

export async function listWorkflows(): Promise<WorkflowMeta[]> {
  const dir = getWorkflowsDir()
  const files = await fs.promises.readdir(dir)
  const metas: WorkflowMeta[] = []
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    try {
      const raw = JSON.parse(await fs.promises.readFile(path.join(dir, f), 'utf-8')) as Workflow
      const meta: WorkflowMeta = {
        id: raw.id,
        name: raw.name,
        nodeCount: raw.nodes?.length ?? 0,
        updatedAt: raw.updatedAt,
      }
      if (raw.description !== undefined) meta.description = raw.description
      metas.push(meta)
    } catch (err) {
      log.warn('Failed to parse workflow file', { file: f, err: String(err) })
    }
  }
  return metas
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
  const now = Date.now()
  const w: Workflow = {
    ...workflow,
    updatedAt: now,
    createdAt: workflow.createdAt || now,
    id: workflow.id || crypto.randomUUID(),
  }
  const file = path.join(getWorkflowsDir(), `${safeId(w.id)}.json`)
  await fs.promises.writeFile(file, JSON.stringify(w, null, 2), 'utf-8')
  log.info('Workflow saved', { id: w.id, name: w.name })
  return w
}

export async function renameWorkflow(id: string, name: string): Promise<void> {
  const wf = await loadWorkflow(id)
  if (!wf) {
    log.warn('Cannot rename — workflow not found', { id })
    return
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
