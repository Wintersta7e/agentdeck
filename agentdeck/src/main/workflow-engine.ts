import { BrowserWindow } from 'electron'
import { spawn, execFile, type ChildProcess } from 'child_process'
import { createLogger } from './logger'
import type { PtyManager } from './pty-manager'
import type {
  Workflow,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowEdge,
  WorkflowEvent,
  Role,
} from '../shared/types'
import { AGENT_BINARY_MAP, KNOWN_AGENT_IDS, SAFE_FLAGS_RE } from '../shared/agents'

const log = createLogger('workflow-engine')

const VALID_NODE_TYPES = new Set<WorkflowNodeType>(['agent', 'shell', 'checkpoint'])

/** Max field lengths for workflow validation */
const MAX_NAME = 200
const MAX_DESCRIPTION = 2000
const MAX_COMMAND = 10000
const MAX_PROMPT = 10000
const MAX_NODES = 100
const MAX_EDGES = 500
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/

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

/**
 * Prefix sourced before every workflow command in bash -lc (non-interactive).
 * Login shells don't source .bashrc, so nvm/fnm/volta aren't on PATH.
 * This explicitly initialises the most common node version managers.
 */
const NODE_INIT =
  [
    '[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" 2>/dev/null',
    'type fnm &>/dev/null && eval "$(fnm env --shell bash)" 2>/dev/null',
    'true',
  ].join('; ') + '; '

/** How often to flush the line buffer even without a newline (ms) */
const LINE_FLUSH_MS = 3000

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

function stripAnsi(s: string): string {
  return s.replace(ANSI_STRIP_RE, '')
}

/** Shell-safe single-quote escaping */
function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

export interface WorkflowEngine {
  run: (workflow: Workflow, projectPath?: string | undefined) => void
  stop: (workflowId: string) => void
  resume: (workflowId: string, nodeId: string) => void
  isRunning: (workflowId: string) => boolean
  stopAll: () => void
}

// Re-export for any external importers (backward compat)
export { ptyBus } from './pty-bus'

/**
 * Runtime validation of a workflow loaded from disk (C2).
 * Throws descriptive error if the structure is invalid or fields exceed limits.
 */
export function validateWorkflow(w: unknown): w is Workflow {
  if (!w || typeof w !== 'object') throw new Error('Workflow is not an object')
  const wf = w as Record<string, unknown>
  if (typeof wf.id !== 'string' || !SAFE_ID_RE.test(wf.id))
    throw new Error(`Invalid workflow id: ${String(wf.id)}`)
  if (typeof wf.name !== 'string') throw new Error('Workflow name must be a string')
  if (wf.name.length > MAX_NAME) throw new Error(`Workflow name exceeds ${MAX_NAME} chars`)
  if (wf.description !== undefined && typeof wf.description !== 'string')
    throw new Error('Workflow description must be a string')
  if (typeof wf.description === 'string' && wf.description.length > MAX_DESCRIPTION)
    throw new Error(`Workflow description exceeds ${MAX_DESCRIPTION} chars`)
  if (!Array.isArray(wf.nodes)) throw new Error('Workflow nodes must be an array')
  if (wf.nodes.length > MAX_NODES) throw new Error(`Workflow exceeds ${MAX_NODES} nodes`)
  if (!Array.isArray(wf.edges)) throw new Error('Workflow edges must be an array')
  if ((wf.edges as unknown[]).length > MAX_EDGES)
    throw new Error(`Workflow exceeds ${MAX_EDGES} edges`)
  for (const n of wf.nodes as Record<string, unknown>[]) {
    if (typeof n.id !== 'string') throw new Error('Node id must be a string')
    if (!VALID_NODE_TYPES.has(n.type as WorkflowNodeType))
      throw new Error(`Invalid node type: ${String(n.type)}`)
    if (typeof n.name !== 'string') throw new Error('Node name must be a string')
    if (n.name.length > MAX_NAME) throw new Error(`Node name exceeds ${MAX_NAME} chars`)
    if (n.command !== undefined && typeof n.command === 'string' && n.command.length > MAX_COMMAND)
      throw new Error(`Node command exceeds ${MAX_COMMAND} chars`)
    if (n.prompt !== undefined && typeof n.prompt === 'string' && n.prompt.length > MAX_PROMPT)
      throw new Error(`Node prompt exceeds ${MAX_PROMPT} chars`)
    if (n.agent !== undefined && typeof n.agent === 'string' && !KNOWN_AGENT_IDS.has(n.agent))
      throw new Error(`Unknown agent: ${n.agent}`)
    if (n.roleId !== undefined && n.roleId !== null && typeof n.roleId !== 'string')
      throw new Error('Node roleId must be a string')
    if (typeof n.roleId === 'string' && n.roleId.length > MAX_NAME)
      throw new Error(`Node roleId exceeds ${MAX_NAME} chars`)
  }
  return true
}

/** Topological sort -- returns array of tiers (each tier = parallel batch) */
function topoSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[][] {
  const inDegree = new Map<string, number>()
  const downstream = new Map<string, string[]>()

  for (const n of nodes) {
    inDegree.set(n.id, 0)
    downstream.set(n.id, [])
  }
  for (const e of edges) {
    inDegree.set(e.toNodeId, (inDegree.get(e.toNodeId) ?? 0) + 1)
    downstream.get(e.fromNodeId)?.push(e.toNodeId)
  }

  const tiers: WorkflowNode[][] = []
  let remaining = [...nodes]

  while (remaining.length > 0) {
    const tier = remaining.filter((n) => (inDegree.get(n.id) ?? 0) === 0)
    if (tier.length === 0) throw new Error('Circular dependency detected in workflow')
    tiers.push(tier)
    for (const n of tier) {
      for (const dep of downstream.get(n.id) ?? []) {
        inDegree.set(dep, (inDegree.get(dep) ?? 0) - 1)
      }
    }
    remaining = remaining.filter((n) => !tier.includes(n))
  }

  return tiers
}

export function createWorkflowEngine(
  _ptyManager: PtyManager,
  mainWindow: BrowserWindow,
  getRoles?: (() => Role[]) | undefined,
): WorkflowEngine {
  const activeRuns = new Map<string, { stop: () => void; resume: (nodeId: string) => void }>()

  function push(workflowId: string, event: Omit<WorkflowEvent, 'id' | 'timestamp'>): void {
    if (mainWindow.isDestroyed()) return
    const safeChannel = `workflow:event:${workflowId.replace(/[^a-zA-Z0-9_-]/g, '')}`
    mainWindow.webContents.send(safeChannel, {
      ...event,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    })
  }

  function runWorkflow(workflow: Workflow, projectPath?: string | undefined): void {
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

    let stopped = false
    const nodeOutputs = new Map<string, string>()
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
        // Build prompt: [role persona] + [task prompt] + [output format] + [context]
        const role = node.roleId ? roles.get(node.roleId) : undefined
        const promptParts: string[] = []
        if (role?.persona) promptParts.push(role.persona)
        if (node.prompt) promptParts.push(node.prompt)
        if (role?.outputFormat) promptParts.push(`Output format:\n${role.outputFormat}`)
        if (contextSummary) promptParts.push(`Context from previous steps:\n${contextSummary}`)
        const prompt = promptParts.join('\n\n')

        if (!prompt) {
          resolve()
          return
        }

        const agentName = node.agent ?? 'claude-code'
        const bin = AGENT_BINARY_MAP[agentName] ?? agentName
        const printFlags = AGENT_PRINT_FLAGS[agentName] ?? ['--print']

        let sanitizedFlags = ''
        if (node.agentFlags && SAFE_FLAGS_RE.test(node.agentFlags)) {
          sanitizedFlags = ` ${node.agentFlags}`
        }

        // Build non-interactive command: cd to project, then run agent in print mode
        const parts: string[] = []
        if (projectPath) parts.push(`cd ${shellQuote(projectPath)}`)
        const flagStr = printFlags.length > 0 ? printFlags.join(' ') + ' ' : ''
        parts.push(`${bin} ${flagStr}${shellQuote(prompt)}${sanitizedFlags}`)
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

        const handleData = (chunk: Buffer): void => {
          const text = stripAnsi(chunk.toString())
          if (!text) return
          output = (output + text).slice(-8192)
          nodeOutputs.set(node.id, output)
          flushLines(text)
        }

        child.stdout?.on('data', handleData)
        child.stderr?.on('data', handleData)

        child.on('close', (code) => {
          clearInterval(flushTimer)
          activeChildProcesses.delete(child)
          // Flush any remaining partial line
          const remaining = lineBuf.trim()
          if (remaining) emitLine(remaining)
          if (code === 0 || code === null) resolve()
          else reject(new Error(`Agent ${bin} exited with code ${code}`))
        })

        child.on('error', (err: Error) => {
          clearInterval(flushTimer)
          activeChildProcesses.delete(child)
          reject(err)
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

    async function execute(): Promise<void> {
      push(workflow.id, {
        type: 'workflow:started',
        workflowId: workflow.id,
        message: `Workflow "${workflow.name}" started`,
      })

      let tiers: WorkflowNode[][]
      try {
        tiers = topoSort(workflow.nodes, workflow.edges)
      } catch (err) {
        push(workflow.id, {
          type: 'workflow:error',
          workflowId: workflow.id,
          message: String(err),
        })
        return
      }

      try {
        for (const tier of tiers) {
          if (stopped) break

          const contextSummary = workflow.edges
            .filter((e) => tier.some((n) => n.id === e.toNodeId))
            .map((e) => {
              const out = nodeOutputs.get(e.fromNodeId)
              return out ? `[${e.fromNodeId}]: ${out.slice(-2000)}` : ''
            })
            .filter(Boolean)
            .join('\n\n')

          await Promise.all(
            tier.map(async (node) => {
              if (stopped) return

              runningNodeIds.add(node.id)
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
                push(workflow.id, {
                  type: 'node:done',
                  workflowId: workflow.id,
                  nodeId: node.id,
                  message: `${node.name} completed`,
                })
              } catch (err) {
                runningNodeIds.delete(node.id)
                push(workflow.id, {
                  type: 'node:error',
                  workflowId: workflow.id,
                  nodeId: node.id,
                  message: String(err),
                })
                stopped = true
                throw err
              }
            }),
          )
        }
      } catch {
        // Node errors propagate here via throw — already emitted as node:error above
      }

      if (!stopped) {
        push(workflow.id, {
          type: 'workflow:done',
          workflowId: workflow.id,
          message: 'All nodes completed',
        })
      } else {
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
