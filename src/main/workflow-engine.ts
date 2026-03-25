import { BrowserWindow } from 'electron'
import { spawn, execFile, type ChildProcess } from 'child_process'
import { createLogger } from './logger'
import type { PtyManager } from './pty-manager'
import type { Workflow, WorkflowNode, WorkflowEdge, WorkflowEvent, Role } from '../shared/types'
import { AGENT_BINARY_MAP, SAFE_FLAGS_RE } from '../shared/agents'
import { topoSort } from '../shared/workflow-utils'
export { validateWorkflow, topoSort } from '../shared/workflow-utils'
import { createScheduler } from './edge-scheduler'
import { NODE_INIT } from './wsl-utils'
import { substituteVariables } from './variable-substitution'

const log = createLogger('workflow-engine')

/** Non-interactive / print-mode CLI flags per agent (prompt follows as last arg) */
const AGENT_PRINT_FLAGS: Record<string, string[]> = {
  'claude-code': ['--print'],
  codex: ['exec'],
  aider: ['--message'],
  goose: ['run', '-t'],
  'gemini-cli': ['-p'],
  'amazon-q': ['chat', '--no-interactive', '--trust-all-tools'],
  opencode: ['run'],
}

const MINUTES = 60_000

/** How long an agent node can be idle (no stdout/stderr) before being killed */
export const AGENT_IDLE_TIMEOUT = 5 * MINUTES

/** How often to check whether an agent node has gone idle */
const IDLE_CHECK_INTERVAL = 0.5 * MINUTES

/** Max number of nodes to run concurrently within a single tier */
const MAX_TIER_CONCURRENCY = 5

/** How often to flush the line buffer even without a newline */
const LINE_FLUSH_MS = 500

/**
 * Force-kill a child process tree on Windows.
 * `child.kill()` only terminates wsl.exe — the Linux process inside WSL
 * survives as an orphan. Use taskkill /F /T to kill the entire tree.
 */
function forceKillTree(child: ChildProcess): void {
  const pid = child.pid
  if (pid == null) {
    child.kill('SIGKILL')
    return
  }
  // pid is a numeric constant from the OS — safe for execFile args
  execFile('taskkill', ['/F', '/T', '/PID', String(pid)], { timeout: 5000 }, (err) => {
    if (err) {
      // Fallback: process may already be dead
      child.kill('SIGKILL')
    }
  })
}

/** Strip ANSI escape sequences and terminal control codes */
const ANSI_STRIP_RE =
  /\x1b\[[0-9;?]*[a-zA-Z~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()#][A-Z0-9]|\x1b[=>NOMDEHc78]|\r/g

export function stripAnsi(s: string): string {
  return s.replace(ANSI_STRIP_RE, '')
}

/** Shell-safe single-quote escaping */
export function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

export interface WorkflowEngine {
  run: (
    workflow: Workflow,
    projectPath?: string | undefined,
    variables?: Record<string, string> | undefined,
  ) => void
  stop: (workflowId: string) => void
  resume: (workflowId: string, nodeId: string) => void
  isRunning: (workflowId: string) => boolean
  stopAll: () => void
}

// Re-export for any external importers (backward compat)
export { ptyBus } from './pty-bus'

export function createWorkflowEngine(
  _ptyManager: PtyManager,
  mainWindow: BrowserWindow,
  getRoles?: (() => Role[]) | undefined,
): WorkflowEngine {
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
    log.info('Starting workflow', {
      id: workflow.id,
      name: workflow.name,
      nodes: workflow.nodes.length,
      projectPath,
    })

    let stopped = false
    const nodeOutputs = new Map<string, string>()
    const nodeExitCodes = new Map<string, number>()
    const activeChildProcesses = new Set<ChildProcess>()
    const runningNodeIds = new Set<string>()
    // H10: Key checkpoints by workflowId:nodeId (scoped to this run)
    const runCheckpoints = new Map<string, () => void>()

    // Resolve roles for persona injection
    const rolesMap = new Map<string, Role>()
    if (getRoles) {
      for (const r of getRoles()) rolesMap.set(r.id, r)
    }

    function runAgentNode(
      node: WorkflowNode,
      contextSummary: string,
      roles: Map<string, Role>,
    ): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        let settled = false
        const settleResolve = (): void => {
          if (settled) return
          settled = true
          resolve()
        }
        const settleReject = (err: Error): void => {
          if (settled) return
          settled = true
          reject(err)
        }

        // Build prompt: [role persona] + [task prompt] + [output format] + [context]
        const role = node.roleId ? roles.get(node.roleId) : undefined
        const promptParts: string[] = []
        if (role?.persona) promptParts.push(role.persona)
        if (node.prompt) promptParts.push(node.prompt)
        if (role?.outputFormat) promptParts.push(`Output format:\n${role.outputFormat}`)
        if (contextSummary) promptParts.push(`Context from previous steps:\n${contextSummary}`)
        const prompt = promptParts.join('\n\n')

        if (!prompt) {
          settleResolve()
          return
        }

        const agentName = node.agent ?? 'claude-code'
        const bin = AGENT_BINARY_MAP[agentName] ?? agentName
        const printFlags = AGENT_PRINT_FLAGS[agentName] ?? ['--print']

        let sanitizedFlags = ''
        if (node.agentFlags) {
          if (SAFE_FLAGS_RE.test(node.agentFlags)) {
            sanitizedFlags = ` ${node.agentFlags}`
          } else {
            push(workflow.id, {
              type: 'node:output',
              workflowId: workflow.id,
              nodeId: node.id,
              message: `⚠ Agent flags rejected (unsafe): ${node.agentFlags}`,
            })
          }
        }

        // Build non-interactive command: cd to project, then run agent in print mode
        const parts: string[] = []
        if (projectPath) parts.push(`cd ${shellQuote(projectPath)}`)
        const flagStr = printFlags.length > 0 ? printFlags.join(' ') + ' ' : ''
        parts.push(`${shellQuote(bin)} ${flagStr}${shellQuote(prompt)}${sanitizedFlags}`)
        const fullCmd = parts.join(' && ')

        push(workflow.id, {
          type: 'node:output',
          workflowId: workflow.id,
          nodeId: node.id,
          message: `$ ${bin} ${flagStr}<prompt>\n`,
        })

        // Use spawn (not PTY) for non-interactive agent execution — no TUI escape codes.
        // bash -lc (login, non-interactive) with explicit nvm/fnm init so WSL node
        // binaries are found instead of broken Windows npm wrappers. We can't use
        // -lic (interactive) because it dumps shell init noise into the output.
        // stdin must be 'pipe' (not 'ignore') — WSL rejects /dev/null stdin with
        // E_UNEXPECTED. We close the pipe immediately after spawn.
        const child = spawn('wsl.exe', ['--', 'bash', '-lc', NODE_INIT + fullCmd], {
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        child.stdin?.end()
        activeChildProcesses.add(child)

        let output = ''
        let lineBuf = ''
        const emitLine = (text: string): void => {
          push(workflow.id, {
            type: 'node:output',
            workflowId: workflow.id,
            nodeId: node.id,
            message: text,
          })
        }
        const flushLines = (text: string): void => {
          lineBuf += text
          const parts = lineBuf.split('\n')
          lineBuf = parts.pop() ?? ''
          for (const line of parts) {
            const trimmed = line.trim()
            if (!trimmed) continue
            emitLine(trimmed)
          }
        }
        // Periodic flush: emit accumulated partial content even without newlines.
        // Agents can stream long markdown/thinking without trailing newlines.
        const flushTimer = setInterval(() => {
          const pending = lineBuf.trim()
          if (pending) {
            emitLine(pending)
            lineBuf = ''
          }
        }, LINE_FLUSH_MS)

        // Activity tracking: kill agent only when idle (no output) for too long
        let lastActivityTime = Date.now()

        const handleData = (chunk: Buffer): void => {
          const text = stripAnsi(chunk.toString())
          if (!text) return
          lastActivityTime = Date.now()
          output = (output + text).slice(-8192)
          nodeOutputs.set(node.id, output)
          flushLines(text)
        }

        child.stdout?.on('data', handleData)
        child.stderr?.on('data', handleData)

        // Idle timeout: kill agent if it produces no output for AGENT_IDLE_TIMEOUT ms
        const idleCheckTimer = setInterval(() => {
          const idleMs = Date.now() - lastActivityTime
          if (idleMs >= AGENT_IDLE_TIMEOUT) {
            log.warn('Agent node idle timeout', {
              workflowId: workflow.id,
              nodeId: node.id,
              agent: bin,
              idleMs,
            })
            forceKillTree(child)
            clearInterval(flushTimer)
            clearInterval(idleCheckTimer)
            clearTimeout(absoluteTimer)
            activeChildProcesses.delete(child)
            settleReject(
              new Error(`Agent ${bin} idle for ${Math.round(idleMs / 1000)}s — no output`),
            )
          }
        }, IDLE_CHECK_INTERVAL)

        // Optional absolute timeout: only if the user set node.timeout explicitly
        const absoluteTimer = node.timeout
          ? setTimeout(() => {
              log.warn('Agent node absolute timeout', {
                workflowId: workflow.id,
                nodeId: node.id,
                agent: bin,
                timeoutMs: node.timeout,
              })
              forceKillTree(child)
              clearInterval(flushTimer)
              clearInterval(idleCheckTimer)
              activeChildProcesses.delete(child)
              settleReject(
                new Error(
                  `Agent ${bin} timed out after ${(node.timeout ?? 0) / 1000}s (absolute limit)`,
                ),
              )
            }, node.timeout)
          : undefined

        child.on('close', (code) => {
          clearInterval(idleCheckTimer)
          clearTimeout(absoluteTimer)
          clearInterval(flushTimer)
          activeChildProcesses.delete(child)
          nodeExitCodes.set(node.id, code ?? 0)
          // Flush any remaining partial line
          const remaining = lineBuf.trim()
          if (remaining) emitLine(remaining)
          if (code === 0 || code === null) settleResolve()
          else settleReject(new Error(`Agent ${bin} exited with code ${code}`))
        })

        child.on('error', (err: Error) => {
          clearInterval(idleCheckTimer)
          clearTimeout(absoluteTimer)
          clearInterval(flushTimer)
          activeChildProcesses.delete(child)
          settleReject(err)
        })
      })
    }

    function runShellNode(node: WorkflowNode): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        // Convert literal \n sequences to real newlines so multi-line commands
        // (e.g. python3 -c "def f():\n  return 1") execute correctly in bash.
        const cmd = (node.command ?? '').replace(/\\n/g, '\n')
        push(workflow.id, {
          type: 'node:output',
          workflowId: workflow.id,
          nodeId: node.id,
          message: `$ ${node.command ?? ''}\n`,
        })

        // M8: Use projectPath as cwd context for shell commands
        const fullCmd = projectPath ? `cd ${shellQuote(projectPath)} && ${cmd}` : cmd

        const child = execFile(
          'wsl.exe',
          ['--', 'bash', '-lc', NODE_INIT + fullCmd],
          { timeout: node.timeout ?? 60000 },
          (err, stdout, stderr) => {
            activeChildProcesses.delete(child)
            nodeExitCodes.set(node.id, err ? 1 : 0)
            const out = stripAnsi(stdout + stderr)
            nodeOutputs.set(node.id, out)
            push(workflow.id, {
              type: 'node:output',
              workflowId: workflow.id,
              nodeId: node.id,
              message: out,
            })
            if (err) reject(err)
            else resolve()
          },
        )
        // C4: Track child process so stop() can kill it
        activeChildProcesses.add(child)
      })
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
        const output = nodeOutputs.get(upstreamId) ?? ''
        if (!output) {
          push(workflow.id, {
            type: 'node:output',
            workflowId: workflow.id,
            nodeId: node.id,
            message: '\u26a0 Upstream produced no output, evaluating as false',
          })
          return 'false'
        }
        try {
          return new RegExp(node.conditionPattern ?? '').test(output) ? 'true' : 'false'
        } catch {
          return 'false'
        }
      }
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
              scheduler.resetLoopSubgraph(le.toNodeId, node.id)
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
            await runAgentNode(node, contextSummary, rolesMap)
          } else if (node.type === 'shell') {
            await runShellNode(node)
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
    stopAll: (): void => {
      for (const [id, run] of activeRuns) {
        log.info('Stopping workflow on quit', { id })
        run.stop()
      }
    },
  }
}
