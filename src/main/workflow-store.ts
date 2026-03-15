import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { createLogger } from './logger'
import { validateWorkflow } from './workflow-engine'
import type { Workflow, WorkflowMeta, WorkflowNode, WorkflowEdge } from '../shared/types'
import type { AppStore } from './project-store'
import { getRolesFromStore } from './project-store'

const log = createLogger('workflow-store')

const WORKFLOW_SEED_VERSION = 1

interface SeedNode {
  id: string
  type: WorkflowNode['type']
  name: string
  x: number
  y: number
  agent?: string | undefined
  agentFlags?: string | undefined
  prompt?: string | undefined
  message?: string | undefined
  _roleName?: string | undefined
}

interface SeedWorkflowBlueprint {
  id: string
  name: string
  description: string
  nodes: SeedNode[]
  edges: WorkflowEdge[]
}

const SEED_WORKFLOWS: SeedWorkflowBlueprint[] = [
  // 1. Lint & Fix
  {
    id: 'seed-wf-lint-fix',
    name: 'Lint & Fix',
    description: 'Run the linter, fix all errors, then verify the fixes.',
    nodes: [
      {
        id: 'seed-wf-lint-fix-n1',
        type: 'agent',
        name: 'Run Linter',
        x: 100,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Run this project's linter and type-checker. Report every error and warning with file paths and line numbers. If no linter config exists, identify the project language/framework and use the standard linter for it.",
        _roleName: 'Reviewer',
      },
      {
        id: 'seed-wf-lint-fix-n2',
        type: 'agent',
        name: 'Fix Errors',
        x: 350,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Fix every lint and type error reported in the previous step. Make minimal changes \u2014 fix the errors without refactoring surrounding code.',
        _roleName: 'Developer',
      },
      {
        id: 'seed-wf-lint-fix-n3',
        type: 'agent',
        name: 'Verify Fixes',
        x: 600,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Re-run the project's linter and type-checker. Confirm all previously reported issues are resolved. Report any remaining errors.",
        _roleName: 'Reviewer',
      },
    ],
    edges: [
      {
        id: 'seed-wf-lint-fix-e1',
        fromNodeId: 'seed-wf-lint-fix-n1',
        toNodeId: 'seed-wf-lint-fix-n2',
      },
      {
        id: 'seed-wf-lint-fix-e2',
        fromNodeId: 'seed-wf-lint-fix-n2',
        toNodeId: 'seed-wf-lint-fix-n3',
      },
    ],
  },

  // 2. Code Review & Fix
  {
    id: 'seed-wf-code-review',
    name: 'Code Review & Fix',
    description: 'Review code for issues, get human approval, fix them, then run tests.',
    nodes: [
      {
        id: 'seed-wf-code-review-n1',
        type: 'agent',
        name: 'Review Code',
        x: 100,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Review the codebase for bugs, security vulnerabilities, performance problems, and code quality issues. List each finding with: severity (critical/high/medium/low), file path, line number, description, and suggested fix.',
        _roleName: 'Reviewer',
      },
      {
        id: 'seed-wf-code-review-n2',
        type: 'checkpoint',
        name: 'Approve Findings',
        x: 350,
        y: 200,
        message:
          'Review the findings above. Remove or adjust any items you disagree with before proceeding to auto-fix.',
      },
      {
        id: 'seed-wf-code-review-n3',
        type: 'agent',
        name: 'Fix Issues',
        x: 600,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Fix all issues identified in the code review. Address them in order of severity \u2014 critical first, then high, medium, low.',
        _roleName: 'Developer',
      },
      {
        id: 'seed-wf-code-review-n4',
        type: 'agent',
        name: 'Run Tests',
        x: 850,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Run this project's full test suite. Report the results \u2014 number of tests passed, failed, and skipped. If any tests fail, report which tests and why.",
        _roleName: 'Tester',
      },
    ],
    edges: [
      {
        id: 'seed-wf-code-review-e1',
        fromNodeId: 'seed-wf-code-review-n1',
        toNodeId: 'seed-wf-code-review-n2',
      },
      {
        id: 'seed-wf-code-review-e2',
        fromNodeId: 'seed-wf-code-review-n2',
        toNodeId: 'seed-wf-code-review-n3',
      },
      {
        id: 'seed-wf-code-review-e3',
        fromNodeId: 'seed-wf-code-review-n3',
        toNodeId: 'seed-wf-code-review-n4',
      },
    ],
  },

  // 3. Feature from Ticket
  {
    id: 'seed-wf-feature-ticket',
    name: 'Feature from Ticket',
    description: 'Read a ticket spec, plan the implementation, get approval, build it, then test.',
    nodes: [
      {
        id: 'seed-wf-feature-ticket-n1',
        type: 'agent',
        name: 'Read & Plan',
        x: 100,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Read the ticket specification at `<TICKET_PATH>`. If it's a folder, read all files in it. Analyze the requirements and create a detailed implementation plan: list the files to create/modify, the components/functions needed, data flow, edge cases to handle, and a suggested build order.",
        _roleName: 'Architect',
      },
      {
        id: 'seed-wf-feature-ticket-n2',
        type: 'checkpoint',
        name: 'Approve Plan',
        x: 350,
        y: 200,
        message: 'Review the implementation plan. Adjust scope or approach before proceeding.',
      },
      {
        id: 'seed-wf-feature-ticket-n3',
        type: 'agent',
        name: 'Implement',
        x: 600,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Implement the plan from the previous step. Follow the build order and handle all specified edge cases.',
        _roleName: 'Developer',
      },
      {
        id: 'seed-wf-feature-ticket-n4',
        type: 'agent',
        name: 'Write & Run Tests',
        x: 850,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Write comprehensive tests for the new feature \u2014 cover happy paths, edge cases, and error paths. Then run the full test suite and report results.',
        _roleName: 'Tester',
      },
    ],
    edges: [
      {
        id: 'seed-wf-feature-ticket-e1',
        fromNodeId: 'seed-wf-feature-ticket-n1',
        toNodeId: 'seed-wf-feature-ticket-n2',
      },
      {
        id: 'seed-wf-feature-ticket-e2',
        fromNodeId: 'seed-wf-feature-ticket-n2',
        toNodeId: 'seed-wf-feature-ticket-n3',
      },
      {
        id: 'seed-wf-feature-ticket-e3',
        fromNodeId: 'seed-wf-feature-ticket-n3',
        toNodeId: 'seed-wf-feature-ticket-n4',
      },
    ],
  },

  // 4. Plan & Implement
  {
    id: 'seed-wf-plan-implement',
    name: 'Plan & Implement',
    description: 'Create an implementation plan, get approval, build it, then test.',
    nodes: [
      {
        id: 'seed-wf-plan-implement-n1',
        type: 'agent',
        name: 'Create Plan',
        x: 100,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Analyze the codebase and create a detailed implementation plan for the following feature: `<DESCRIBE YOUR FEATURE>`. Include: files to create/modify, components/functions needed, data flow, edge cases, and build order.',
        _roleName: 'Architect',
      },
      {
        id: 'seed-wf-plan-implement-n2',
        type: 'checkpoint',
        name: 'Approve Plan',
        x: 350,
        y: 200,
        message: 'Review the plan before implementation begins.',
      },
      {
        id: 'seed-wf-plan-implement-n3',
        type: 'agent',
        name: 'Implement',
        x: 600,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt: 'Implement the plan from the previous step. Follow the build order.',
        _roleName: 'Developer',
      },
      {
        id: 'seed-wf-plan-implement-n4',
        type: 'agent',
        name: 'Write & Run Tests',
        x: 850,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt: 'Write tests for the new feature and run the full test suite. Report results.',
        _roleName: 'Tester',
      },
    ],
    edges: [
      {
        id: 'seed-wf-plan-implement-e1',
        fromNodeId: 'seed-wf-plan-implement-n1',
        toNodeId: 'seed-wf-plan-implement-n2',
      },
      {
        id: 'seed-wf-plan-implement-e2',
        fromNodeId: 'seed-wf-plan-implement-n2',
        toNodeId: 'seed-wf-plan-implement-n3',
      },
      {
        id: 'seed-wf-plan-implement-e3',
        fromNodeId: 'seed-wf-plan-implement-n3',
        toNodeId: 'seed-wf-plan-implement-n4',
      },
    ],
  },

  // 5. Security Audit
  {
    id: 'seed-wf-security-audit',
    name: 'Security Audit',
    description: 'Scan for vulnerabilities, fix critical/high issues, then verify with tests.',
    nodes: [
      {
        id: 'seed-wf-security-audit-n1',
        type: 'agent',
        name: 'Scan Vulnerabilities',
        x: 100,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Scan this project for security vulnerabilities. Check for: OWASP top 10 (injection, XSS, CSRF, etc.), hardcoded secrets/API keys, insecure dependencies, improper error handling that leaks info, insecure file permissions, authentication/authorization flaws. Rank each finding by severity: critical, high, medium, low.',
        _roleName: 'Security Auditor',
      },
      {
        id: 'seed-wf-security-audit-n2',
        type: 'agent',
        name: 'Fix Critical/High',
        x: 350,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Fix all critical and high severity security findings from the previous step. For each fix, explain what was vulnerable and how the fix addresses it. Do not fix medium/low findings \u2014 leave those for manual review.',
        _roleName: 'Developer',
      },
      {
        id: 'seed-wf-security-audit-n3',
        type: 'agent',
        name: 'Run Tests',
        x: 600,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Run the project's full test suite to verify the security fixes don't break existing functionality. Report results.",
        _roleName: 'Tester',
      },
    ],
    edges: [
      {
        id: 'seed-wf-security-audit-e1',
        fromNodeId: 'seed-wf-security-audit-n1',
        toNodeId: 'seed-wf-security-audit-n2',
      },
      {
        id: 'seed-wf-security-audit-e2',
        fromNodeId: 'seed-wf-security-audit-n2',
        toNodeId: 'seed-wf-security-audit-n3',
      },
    ],
  },

  // 6. Refactor Pass
  {
    id: 'seed-wf-refactor-pass',
    name: 'Refactor Pass',
    description: 'Analyze code for refactoring, get approval, refactor, then test.',
    nodes: [
      {
        id: 'seed-wf-refactor-pass-n1',
        type: 'agent',
        name: 'Analyze Code',
        x: 100,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Analyze this codebase for refactoring opportunities: duplicated code, overly complex functions, poor naming, missing abstractions, dead code, inconsistent patterns. For each finding, describe the current problem and the proposed improvement. Prioritize by impact.',
        _roleName: 'Refactorer',
      },
      {
        id: 'seed-wf-refactor-pass-n2',
        type: 'checkpoint',
        name: 'Approve Refactoring',
        x: 350,
        y: 200,
        message: "Review the refactoring proposal. Remove any changes you don't want applied.",
      },
      {
        id: 'seed-wf-refactor-pass-n3',
        type: 'agent',
        name: 'Refactor',
        x: 600,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Execute the approved refactoring from the previous step. Make each change cleanly \u2014 ensure imports, references, and tests are updated accordingly.',
        _roleName: 'Developer',
      },
      {
        id: 'seed-wf-refactor-pass-n4',
        type: 'agent',
        name: 'Run Tests',
        x: 850,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Run the full test suite to confirm the refactoring hasn't broken anything. Report results.",
        _roleName: 'Tester',
      },
    ],
    edges: [
      {
        id: 'seed-wf-refactor-pass-e1',
        fromNodeId: 'seed-wf-refactor-pass-n1',
        toNodeId: 'seed-wf-refactor-pass-n2',
      },
      {
        id: 'seed-wf-refactor-pass-e2',
        fromNodeId: 'seed-wf-refactor-pass-n2',
        toNodeId: 'seed-wf-refactor-pass-n3',
      },
      {
        id: 'seed-wf-refactor-pass-e3',
        fromNodeId: 'seed-wf-refactor-pass-n3',
        toNodeId: 'seed-wf-refactor-pass-n4',
      },
    ],
  },

  // 7. Bug Triage
  {
    id: 'seed-wf-bug-triage',
    name: 'Bug Triage',
    description: 'Investigate a bug, fix the root cause, then write a regression test.',
    nodes: [
      {
        id: 'seed-wf-bug-triage-n1',
        type: 'agent',
        name: 'Investigate Bug',
        x: 100,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Investigate the following bug: `<DESCRIBE THE BUG>`. Trace the root cause through the codebase. Identify the affected code paths, the conditions that trigger it, and why it fails.',
        _roleName: 'Debugger',
      },
      {
        id: 'seed-wf-bug-triage-n2',
        type: 'agent',
        name: 'Fix Bug',
        x: 350,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          "Implement a fix for the root cause identified in the previous step. Make the minimal change needed \u2014 don't refactor surrounding code.",
        _roleName: 'Developer',
      },
      {
        id: 'seed-wf-bug-triage-n3',
        type: 'agent',
        name: 'Regression Test',
        x: 600,
        y: 200,
        agent: 'codex',
        agentFlags: '--full-auto --ephemeral',
        prompt:
          'Write a regression test that reproduces the original bug and verifies the fix. Then run the full test suite and report results.',
        _roleName: 'Tester',
      },
    ],
    edges: [
      {
        id: 'seed-wf-bug-triage-e1',
        fromNodeId: 'seed-wf-bug-triage-n1',
        toNodeId: 'seed-wf-bug-triage-n2',
      },
      {
        id: 'seed-wf-bug-triage-e2',
        fromNodeId: 'seed-wf-bug-triage-n2',
        toNodeId: 'seed-wf-bug-triage-n3',
      },
    ],
  },
]

export async function seedWorkflows(store: AppStore): Promise<void> {
  const prefs = store.get('appPrefs')
  const currentVersion = prefs.workflowSeedVersion ?? 0
  const rolesVersion = prefs.rolesSeedVersion ?? 0
  const lastRolesVersion = prefs.workflowLastRolesVersion ?? 0
  const rolesChanged = rolesVersion !== lastRolesVersion

  if (currentVersion >= WORKFLOW_SEED_VERSION && !rolesChanged) return

  const roles = getRolesFromStore(store)
  const roleMap = new Map<string, string>()
  for (const r of roles) {
    if (r.builtin) roleMap.set(r.name, r.id)
  }

  // Only delete old seed workflows on upgrade (not fresh install — nothing to delete)
  if (currentVersion > 0) {
    const dir = getWorkflowsDir()
    try {
      const files = await fs.promises.readdir(dir)
      for (const f of files) {
        if (f.startsWith('seed-wf-') && f.endsWith('.json')) {
          await fs.promises.rm(path.join(dir, f), { force: true })
        }
      }
      log.info('Cleared old seed workflows for upgrade')
    } catch (err) {
      log.warn('Failed to clean old seed workflows during upgrade', { err: String(err) })
    }
  }

  let count = 0
  for (const blueprint of SEED_WORKFLOWS) {
    const nodes: WorkflowNode[] = blueprint.nodes.map((n) => {
      const node: WorkflowNode = {
        id: n.id,
        type: n.type,
        name: n.name,
        x: n.x,
        y: n.y,
      }
      if (n.agent !== undefined) node.agent = n.agent as WorkflowNode['agent']
      if (n.agentFlags !== undefined) node.agentFlags = n.agentFlags
      if (n.prompt !== undefined) node.prompt = n.prompt
      if (n.message !== undefined) node.message = n.message
      if (n._roleName !== undefined) {
        const roleId = roleMap.get(n._roleName)
        if (roleId) node.roleId = roleId
        else
          log.warn('Seed workflow references unknown role', {
            role: n._roleName,
            workflow: blueprint.id,
          })
      }
      return node
    })

    const workflow: Workflow = {
      id: blueprint.id,
      name: blueprint.name,
      description: blueprint.description,
      nodes,
      edges: blueprint.edges,
      createdAt: 0,
      updatedAt: 0,
    }

    await saveWorkflow(workflow)
    count++
  }

  const freshPrefs = store.get('appPrefs')
  store.set('appPrefs', {
    ...freshPrefs,
    workflowSeedVersion: WORKFLOW_SEED_VERSION,
    workflowLastRolesVersion: rolesVersion,
  })
  log.info(`Seeded ${String(count)} built-in workflows (v${String(WORKFLOW_SEED_VERSION)})`)
}

/** Validate id is safe for filesystem use — reject anything with non-alphanumeric chars */
function safeId(id: string): string {
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid workflow id for filesystem use: ${id}`)
  }
  return id
}

// M4: Cache workflows directory path
let cachedWorkflowsDir: string | null = null

function getWorkflowsDir(): string {
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
    validateWorkflow(w)

    // H5: Atomic write — write to .tmp then rename
    const file = path.join(getWorkflowsDir(), `${safeId(w.id)}.json`)
    const tmpFile = file + '.tmp'
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
