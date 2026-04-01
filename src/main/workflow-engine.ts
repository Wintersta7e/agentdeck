import { BrowserWindow } from 'electron'
import type { ChildProcess } from 'child_process'
import { createLogger } from './logger'
import type { PtyManager } from './pty-manager'
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  WorkflowEvent,
  WorkflowNodeRun,
  Role,
} from '../shared/types'
import { topoSort } from '../shared/workflow-utils'
export { validateWorkflow, topoSort } from '../shared/workflow-utils'
import { createScheduler } from './edge-scheduler'
import { substituteVariables } from './variable-substitution'
import {
  runAgentNode,
  runShellNode,
  forceKillTree,
  MAX_TIER_CONCURRENCY,
  type NodeRunnerDeps,
} from './node-runners'
import { createRunRecorder, getErrorTail } from './workflow-history'

// Re-export for backward compat (tests + external importers)
export { stripAnsi, shellQuote, AGENT_IDLE_TIMEOUT } from './node-runners'

const log = createLogger('workflow-engine')

export interface WorkflowEngine {
  run: (
    workflow: Workflow,
    projectPath?: string | undefined,
    variables?: Record<string, string> | undefined,
  ) => void
  stop: (workflowId: string) => void
  resume: (workflowId: string, nodeId: string) => void
  isRunning: (workflowId: string) => boolean
  getRunningWorkflows: () => string[]
  stopAll: () => void
}

// Re-export for any external importers (backward compat)
export { ptyBus } from './pty-bus'

export function createWorkflowEngine(
  _ptyManager: PtyManager,
  mainWindow: BrowserWindow,
  getRoles?: (() => Role[]) | undefined,
): WorkflowEngine {
  const MAX_CONCURRENT_WORKFLOWS = 3
  const activeRuns = new Map<string, { stop: () => void; resume: (nodeId: string) => void }>()

  function push(workflowId: string, event: Omit<WorkflowEvent, 'id' | 'timestamp'>): void {
    if (mainWindow.isDestroyed()) return
    const safeChannel = `workflow:event:${workflowId}`
    mainWindow.webContents.send(safeChannel, {
      ...event,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    })
  }

  function runWorkflow(
    inputWorkflow: Workflow,
    projectPath?: string | undefined,
    variables?: Record<string, string> | undefined,
  ): void {
    // Substitute {{VAR}} placeholders in node fields before execution
    const workflow =
      variables && Object.keys(variables).length > 0
        ? substituteVariables(inputWorkflow, variables)
        : inputWorkflow
    if (activeRuns.size >= MAX_CONCURRENT_WORKFLOWS) {
      log.warn('Max concurrent workflows reached', { limit: MAX_CONCURRENT_WORKFLOWS })
      throw new Error(`Maximum concurrent workflow runs reached (${MAX_CONCURRENT_WORKFLOWS})`)
    }
    // C5: Guard against concurrent runs of the same workflow
    if (activeRuns.has(workflow.id)) {
      log.warn('Workflow already running, ignoring duplicate run', { id: workflow.id })
      push(workflow.id, {
        type: 'workflow:error',
        workflowId: workflow.id,
        message: 'Workflow is already running',
      })
      return
    }
    // BUG-10: Reject empty workflows instead of persisting 0ms run records
    if (workflow.nodes.length === 0) {
      push(workflow.id, {
        type: 'workflow:error',
        workflowId: workflow.id,
        message: 'Workflow has no nodes',
      })
      return
    }
    log.info('Starting workflow', {
      id: workflow.id,
      name: workflow.name,
      nodes: workflow.nodes.length,
      projectPath,
    })

    let stopped = false
    const nodeOutputs = new Map<string, string>()
    const nodeExitCodes = new Map<string, number>()
    // WF-2: Full output (up to 64KB) for condition evaluation — nodeOutputs is truncated to 8KB
    const conditionOutputs = new Map<string, string>()
    const activeChildProcesses = new Set<ChildProcess>()
    const runningNodeIds = new Set<string>()
    // H10: Key checkpoints by workflowId:nodeId (scoped to this run)
    const runCheckpoints = new Map<string, () => void>()

    // ── Run history recorder ────────────────────────────────────────
    const recorder = createRunRecorder(workflow, projectPath, variables ?? {})
    // Track how many times each node was executed (for loopIterations)
    const nodeExecCount = new Map<string, number>()

    // Resolve roles for persona injection
    const rolesMap = new Map<string, Role>()
    if (getRoles) {
      for (const r of getRoles()) rolesMap.set(r.id, r)
    }

    // Dependency injection for extracted node runners
    const deps: NodeRunnerDeps = {
      workflowId: workflow.id,
      projectPath,
      push: (event) => push(workflow.id, event),
      nodeOutputs,
      conditionOutputs,
      nodeExitCodes,
      activeChildProcesses,
      isStopped: () => stopped,
    }

    function onCheckpoint(nodeId: string): Promise<void> {
      return new Promise<void>((resolve) => {
        runCheckpoints.set(nodeId, resolve)
      })
    }

    // ── Condition evaluation ──────────────────────────────────────
    function evaluateCondition(node: WorkflowNode): 'true' | 'false' {
      const incomingEdge = workflow.edges.find(
        (e) => e.toNodeId === node.id && e.edgeType !== 'loop',
      )
      if (!incomingEdge) return 'false'
      const upstreamId = incomingEdge.fromNodeId

      if (node.conditionMode === 'exitCode') {
        const code = nodeExitCodes.get(upstreamId)
        return code === 0 ? 'true' : 'false'
      }

      if (node.conditionMode === 'outputMatch') {
        // WF-2: Read full output from conditionOutputs (64KB), falling back to nodeOutputs (8KB)
        const fullOutput = conditionOutputs.get(upstreamId) ?? nodeOutputs.get(upstreamId) ?? ''
        if (!fullOutput) {
          push(workflow.id, {
            type: 'node:output',
            workflowId: workflow.id,
            nodeId: node.id,
            message: '\u26a0 Upstream produced no output, evaluating as false',
          })
          return 'false'
        }
        // WF-4: Limit output to 100KB to mitigate regex DoS risk from user-provided patterns
        const testOutput = fullOutput.slice(0, 102400)
        try {
          return new RegExp(node.conditionPattern ?? '').test(testOutput) ? 'true' : 'false'
        } catch {
          // PERF-3: Catch regex syntax errors so they don't crash the engine
          log.warn('Condition regex failed', {
            nodeId: node.id,
            pattern: node.conditionPattern,
          })
          return 'false'
        }
      }
      // WF-11: Unknown conditionMode — warn and evaluate as false
      push(workflow.id, {
        type: 'node:output',
        workflowId: workflow.id,
        nodeId: node.id,
        message: `\u26a0 Unknown conditionMode "${String(node.conditionMode)}", evaluating as false`,
      })
      return 'false'
    }

    // ── Process a single node ──────────────────────────────────────
    async function processNode(
      node: WorkflowNode,
      scheduler: ReturnType<typeof createScheduler>,
      loopEdgesByCondition: Map<string, WorkflowEdge[]>,
      loopCounters: Map<string, number>,
    ): Promise<void> {
      if (stopped) return

      // Condition nodes: evaluate inline, no process spawned
      if (node.type === 'condition') {
        const condStartTime = Date.now()
        nodeExecCount.set(node.id, (nodeExecCount.get(node.id) ?? 0) + 1)

        push(workflow.id, {
          type: 'node:started',
          workflowId: workflow.id,
          nodeId: node.id,
          message: `Evaluating ${node.name}`,
        })

        const branch = evaluateCondition(node)
        push(workflow.id, {
          type: 'node:done',
          workflowId: workflow.id,
          nodeId: node.id,
          message: `Condition: ${branch}`,
          branch,
        })
        scheduler.resolveCondition(node.id, branch)

        const condFinishTime = Date.now()
        const condNodeRun: WorkflowNodeRun = {
          nodeId: node.id,
          nodeName: node.name,
          status: 'done',
          startedAt: condStartTime,
          finishedAt: condFinishTime,
          durationMs: condFinishTime - condStartTime,
          branchTaken: branch,
        }
        const condExecN = nodeExecCount.get(node.id) ?? 1
        if (condExecN > 1) condNodeRun.loopIterations = condExecN
        recorder.recordNode(condNodeRun)

        // Handle loop edges
        const condLoops = loopEdgesByCondition.get(node.id) ?? []
        for (const le of condLoops) {
          if (le.branch === branch) {
            const count = (loopCounters.get(le.id) ?? 0) + 1
            loopCounters.set(le.id, count)
            if (count <= (le.maxIterations ?? 1)) {
              push(workflow.id, {
                type: 'node:loopIteration',
                workflowId: workflow.id,
                nodeId: node.id,
                iteration: count,
                maxIterations: le.maxIterations,
                message: `Loop iteration ${String(count)}/${String(le.maxIterations)}`,
              })
              const resetIds = scheduler.resetLoopSubgraph(le.toNodeId, node.id)
              // REL-7: Clear loop counters for inner loop edges within the reset subgraph
              // so nested loops restart correctly on each outer iteration.
              // BUG-5/CDX-5: Also check toNodeId is in resetIds — prevents sibling loop
              // edges from the same condition node from having their counters cleared
              for (const innerLoops of loopEdgesByCondition.values()) {
                for (const innerLe of innerLoops) {
                  if (
                    innerLe.id !== le.id &&
                    resetIds.has(innerLe.fromNodeId) &&
                    resetIds.has(innerLe.toNodeId)
                  ) {
                    loopCounters.delete(innerLe.id)
                  }
                }
              }
              // PERF-4: Clear output maps for re-executing nodes to prevent unbounded growth
              for (const nid of resetIds) {
                nodeOutputs.delete(nid)
                conditionOutputs.delete(nid)
              }
            }
          }
        }
        return
      }

      // Build context summary from upstream node outputs
      const upstreamEdges = workflow.edges.filter(
        (e) => e.toNodeId === node.id && e.edgeType !== 'loop',
      )
      const contextSummary = upstreamEdges
        .map((e) => {
          const out = nodeOutputs.get(e.fromNodeId)
          return out ? `[${e.fromNodeId}]: ${out.slice(-4000)}` : ''
        })
        .filter(Boolean)
        .join('\n\n')

      // Run with retry
      const maxAttempts = (node.retryCount ?? 0) + 1
      const retryDelay = node.retryDelayMs ?? 2000
      let lastError: Error | undefined

      const nodeStartTime = Date.now()
      nodeExecCount.set(node.id, (nodeExecCount.get(node.id) ?? 0) + 1)

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (stopped) return
        if (attempt > 1) {
          push(workflow.id, {
            type: 'node:retry',
            workflowId: workflow.id,
            nodeId: node.id,
            attempt,
            maxAttempts,
            message: `Retry ${String(attempt)}/${String(maxAttempts)}`,
          })
          await new Promise<void>((r) => setTimeout(r, retryDelay))
        }

        runningNodeIds.add(node.id)
        log.info('Node started', {
          workflowId: workflow.id,
          nodeId: node.id,
          type: node.type,
          agent: node.agent,
        })
        push(workflow.id, {
          type: 'node:started',
          workflowId: workflow.id,
          nodeId: node.id,
          message: `Starting ${node.name}`,
        })

        try {
          if (node.type === 'agent') {
            await runAgentNode(node, contextSummary, rolesMap, deps)
          } else if (node.type === 'shell') {
            await runShellNode(node, deps)
          } else if (node.type === 'checkpoint') {
            push(workflow.id, {
              type: 'node:paused',
              workflowId: workflow.id,
              nodeId: node.id,
              message: node.message ?? 'Waiting for user to continue...',
            })
            await onCheckpoint(node.id)
            if (stopped) return
            push(workflow.id, {
              type: 'node:resumed',
              workflowId: workflow.id,
              nodeId: node.id,
              message: 'Resumed',
            })
          }

          runningNodeIds.delete(node.id)
          log.info('Node completed', { workflowId: workflow.id, nodeId: node.id })
          push(workflow.id, {
            type: 'node:done',
            workflowId: workflow.id,
            nodeId: node.id,
            message: `${node.name} completed`,
          })
          scheduler.completeNode(node.id)

          // Record success in run history
          const doneTime = Date.now()
          const doneNodeRun: WorkflowNodeRun = {
            nodeId: node.id,
            nodeName: node.name,
            status: 'done',
            startedAt: nodeStartTime,
            finishedAt: doneTime,
            durationMs: doneTime - nodeStartTime,
          }
          if (attempt > 1) doneNodeRun.retryAttempts = attempt
          const execN = nodeExecCount.get(node.id) ?? 1
          if (execN > 1) doneNodeRun.loopIterations = execN
          recorder.recordNode(doneNodeRun)

          return // success, no more retries
        } catch (err) {
          runningNodeIds.delete(node.id)
          lastError = err instanceof Error ? err : new Error(String(err))
          if (attempt < maxAttempts) continue // retry
        }
      }

      // All attempts exhausted — node failed
      log.warn('Node failed', {
        workflowId: workflow.id,
        nodeId: node.id,
        err: String(lastError),
      })
      push(workflow.id, {
        type: 'node:error',
        workflowId: workflow.id,
        nodeId: node.id,
        message: String(lastError),
      })
      // Record failure in run history
      const errTime = Date.now()
      const errNodeRun: WorkflowNodeRun = {
        nodeId: node.id,
        nodeName: node.name,
        status: 'error',
        startedAt: nodeStartTime,
        finishedAt: errTime,
        durationMs: errTime - nodeStartTime,
        errorTail: getErrorTail(nodeOutputs.get(node.id)),
      }
      if (maxAttempts > 1) errNodeRun.retryAttempts = maxAttempts
      const errExecN = nodeExecCount.get(node.id) ?? 1
      if (errExecN > 1) errNodeRun.loopIterations = errExecN
      recorder.recordNode(errNodeRun)

      if (node.continueOnError) {
        scheduler.completeNode(node.id) // treat as done for scheduling
      } else {
        scheduler.failNode(node.id)
        stopped = true
      }
    }

    // ── Main execution loop ────────────────────────────────────────
    async function execute(): Promise<void> {
      push(workflow.id, {
        type: 'workflow:started',
        workflowId: workflow.id,
        message: `Workflow "${workflow.name}" started`,
      })

      // Validate DAG (catches cycles)
      try {
        topoSort(workflow.nodes, workflow.edges)
      } catch (err) {
        push(workflow.id, {
          type: 'workflow:error',
          workflowId: workflow.id,
          message: String(err),
        })
        recorder.finalize('error')
        return
      }

      const scheduler = createScheduler(workflow.nodes, workflow.edges)

      // Build loop edge lookup: condition node → its loop edges
      const loopEdges = workflow.edges.filter((e) => e.edgeType === 'loop')
      const loopEdgesByCondition = new Map<string, WorkflowEdge[]>()
      for (const le of loopEdges) {
        const list = loopEdgesByCondition.get(le.fromNodeId) ?? []
        list.push(le)
        loopEdgesByCondition.set(le.fromNodeId, list)
      }
      const loopCounters = new Map<string, number>() // edgeId → iteration count

      // Track which nodes we've emitted skip events for
      const emittedSkipped = new Set<string>()

      try {
        while (!scheduler.isDone()) {
          if (stopped) break

          const ready = scheduler.getReady()
          if (ready.length === 0 && !scheduler.isDone()) break // deadlock

          // Execute batch with concurrency limit
          const queue = [...ready]
          const runNext = async (): Promise<void> => {
            let node = queue.shift()
            while (node) {
              if (stopped) return
              await processNode(node, scheduler, loopEdgesByCondition, loopCounters)
              node = queue.shift()
            }
          }
          const workers = Array.from({ length: Math.min(MAX_TIER_CONCURRENCY, ready.length) }, () =>
            runNext(),
          )
          await Promise.all(workers)

          // Check for newly skipped nodes and emit events
          for (const n of workflow.nodes) {
            if (scheduler.getNodeStatus(n.id) === 'skipped' && !emittedSkipped.has(n.id)) {
              emittedSkipped.add(n.id)
              push(workflow.id, {
                type: 'node:skipped',
                workflowId: workflow.id,
                nodeId: n.id,
                message: `${n.name} skipped (branch not taken)`,
              })
              recorder.recordNode({
                nodeId: n.id,
                nodeName: n.name,
                status: 'skipped',
                startedAt: null,
                finishedAt: null,
                durationMs: null,
              })
            }
          }
        }
      } catch (err) {
        // Node failures already emitted as node:error. Log anything unexpected.
        if (err instanceof Error) {
          log.error('Unexpected workflow engine error', {
            workflowId: workflow.id,
            err: err.message,
          })
        }
      }

      if (!stopped) {
        log.info('Workflow completed', { id: workflow.id, name: workflow.name })
        push(workflow.id, {
          type: 'workflow:done',
          workflowId: workflow.id,
          message: 'All nodes completed',
        })
      } else {
        log.info('Workflow stopped', { id: workflow.id, name: workflow.name })
        push(workflow.id, {
          type: 'workflow:stopped',
          workflowId: workflow.id,
          message: 'Workflow stopped',
        })
      }

      // REL-6: Resolve any pending checkpoint promises so execute() can complete
      for (const [, resolve] of runCheckpoints) {
        resolve()
      }
      runCheckpoints.clear()

      // ── Flush run history to disk ────────────────────────────────
      recorder.finalize(stopped ? 'stopped' : 'done')
    }

    const handle = {
      stop: () => {
        stopped = true
        // Immediately mark all running nodes as stopped so the UI updates
        // even if the close event is delayed or never fires (WSL edge case)
        for (const nid of runningNodeIds) {
          push(workflow.id, {
            type: 'node:error',
            workflowId: workflow.id,
            nodeId: nid,
            message: 'Stopped by user',
          })
        }
        runningNodeIds.clear()
        // C4: Force-kill all in-flight child processes (entire process tree)
        for (const child of activeChildProcesses) {
          forceKillTree(child)
        }
        activeChildProcesses.clear()
        // H10: Only clear this run's checkpoints
        for (const [, resolve] of runCheckpoints) {
          resolve()
        }
        runCheckpoints.clear()
      },
      resume: (nodeId: string) => {
        const resolver = runCheckpoints.get(nodeId)
        if (resolver) {
          resolver()
          runCheckpoints.delete(nodeId)
        } else {
          // M8: Warn on invalid checkpoint resume
          push(workflow.id, {
            type: 'node:output',
            workflowId: workflow.id,
            nodeId,
            message: `⚠ Resume called for unknown checkpoint: ${nodeId}`,
          })
        }
      },
    }
    activeRuns.set(workflow.id, handle)

    execute()
      .catch((err: unknown) => {
        // Safety net — the inner try/catch should handle all node errors,
        // but if something unexpected escapes, log and notify.
        log.error('Workflow execution error', { err: String(err) })
        if (!stopped) {
          push(workflow.id, {
            type: 'workflow:error',
            workflowId: workflow.id,
            message: String(err),
          })
        }
        // Flush run history with error status
        recorder.finalize('error')
      })
      .finally(() => {
        activeRuns.delete(workflow.id)
      })
  }

  return {
    run: runWorkflow,
    stop: (workflowId: string) => {
      const run = activeRuns.get(workflowId)
      if (run) run.stop()
    },
    resume: (workflowId: string, nodeId: string) => {
      const run = activeRuns.get(workflowId)
      if (run) run.resume(nodeId)
    },
    isRunning: (workflowId: string) => activeRuns.has(workflowId),
    getRunningWorkflows: () => Array.from(activeRuns.keys()),
    stopAll: (): void => {
      for (const [id, run] of activeRuns) {
        log.info('Stopping workflow on quit', { id })
        run.stop()
      }
    },
  }
}
