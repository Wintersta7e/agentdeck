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

function getWorkflowsDir(): string {
  const dir = path.join(app.getPath('userData'), 'workflows')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function listWorkflows(): WorkflowMeta[] {
  const dir = getWorkflowsDir()
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as Workflow
        const meta: WorkflowMeta = {
          id: raw.id,
          name: raw.name,
          nodeCount: raw.nodes?.length ?? 0,
          updatedAt: raw.updatedAt,
        }
        if (raw.description !== undefined) meta.description = raw.description
        return [meta]
      } catch {
        log.warn('Failed to parse workflow file', { file: f })
        return []
      }
    })
}

export function loadWorkflow(id: string): Workflow | null {
  try {
    const file = path.join(getWorkflowsDir(), `${safeId(id)}.json`)
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Workflow
  } catch {
    return null
  }
}

export function saveWorkflow(workflow: Workflow): Workflow {
  const now = Date.now()
  const w: Workflow = {
    ...workflow,
    updatedAt: now,
    createdAt: workflow.createdAt || now,
    id: workflow.id || crypto.randomUUID(),
  }
  const file = path.join(getWorkflowsDir(), `${safeId(w.id)}.json`)
  fs.writeFileSync(file, JSON.stringify(w, null, 2), 'utf-8')
  log.info('Workflow saved', { id: w.id, name: w.name })
  return w
}

export function deleteWorkflow(id: string): void {
  const file = path.join(getWorkflowsDir(), `${safeId(id)}.json`)
  fs.rmSync(file, { force: true })
  log.info('Workflow deleted', { id })
}
