import { BrowserWindow } from 'electron'
import { spawn, execFile, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { createLogger } from './logger'
import type { PtyManager } from './pty-manager'
import type {
  Workflow,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowEdge,
  WorkflowEvent,
} from '../shared/types'

const log = createLogger('workflow-engine')

/** Known agent binary names — unknown agents are rejected (H2) */
const KNOWN_AGENTS = new Set([
  'claude-code',
  'codex',
  'aider',
  'goose',
  'gemini-cli',
  'amazon-q',
  'opencode',
])

const VALID_NODE_TYPES = new Set<WorkflowNodeType>(['agent', 'shell', 'checkpoint'])

/** Max field lengths for workflow validation (M1) */
const MAX_NAME = 200
const MAX_DESCRIPTION = 2000
const MAX_COMMAND = 10000
const MAX_PROMPT = 10000
const MAX_NODES = 100
const MAX_EDGES = 500
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/
const SAFE_FLAGS_RE = /^[A-Za-z0-9 \-_=./:@,]*$/

/** Agent binary names — keep in sync with pty-manager.ts AGENT_BINARIES */
const AGENT_BINARIES: Record<string, string> = {
  'claude-code': 'claude',
  codex: 'codex',
  aider: 'aider',
  goose: 'goose',
  'gemini-cli': 'gemini',
  'amazon-q': 'q',
  opencode: 'opencode',
}

/** Non-interactive / print-mode CLI flags per agent */
const AGENT_PRINT_FLAGS: Record<string, string[]> = {
  'claude-code': ['--print'],
  codex: ['--quiet'],
  aider: ['--message'],
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
}

/**
 * Internal event bus for PTY data/exit events.
 *
 * pty-manager.ts sends data to the renderer via `webContents.send()`, which
 * is a one-way main->renderer IPC channel that does NOT fire events on the
 * main-process EventEmitter. To let the workflow engine (which lives in
 * the main process) capture PTY output, pty-manager also emits on this bus:
 *
 *   ptyBus.emit(`data:${sessionId}`, data)
 *   ptyBus.emit(`exit:${sessionId}`, exitCode)
 */
export const ptyBus = new EventEmitter()
ptyBus.setMaxListeners(200)

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
    if (n.agent !== undefined && typeof n.agent === 'string' && !KNOWN_AGENTS.has(n.agent))
      throw new Error(`Unknown agent: ${n.agent}`)
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
  ptyManager: PtyManager,
  mainWindow: BrowserWindow,
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
    const activeSessions = new Set<string>()
    const activeChildProcesses = new Set<ChildProcess>()
    // H10: Key checkpoints by workflowId:nodeId (scoped to this run)
    const runCheckpoints = new Map<string, () => void>()

    function runAgentNode(node: WorkflowNode, contextSummary: string): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        const prompt = [
          node.prompt,
          contextSummary ? `\n\nContext from previous steps:\n${contextSummary}` : '',
        ]
          .filter(Boolean)
          .join('')

        if (!prompt) {
          resolve()
          return
        }

        const agentName = node.agent ?? 'claude-code'
        const bin = AGENT_BINARIES[agentName] ?? agentName
        const printFlags = AGENT_PRINT_FLAGS[agentName] ?? ['--print']

        let sanitizedFlags = ''
        if (node.agentFlags && SAFE_FLAGS_RE.test(node.agentFlags)) {
          sanitizedFlags = ` ${node.agentFlags}`
        }

        // Build non-interactive command: cd to project, then run agent in print mode
        const parts: string[] = []
        if (projectPath) parts.push(`cd ${shellQuote(projectPath)}`)
        parts.push(`${bin} ${printFlags.join(' ')} ${shellQuote(prompt)}${sanitizedFlags}`)
        const fullCmd = parts.join(' && ')

        push(workflow.id, {
          type: 'node:output',
          workflowId: workflow.id,
          nodeId: node.id,
          message: `$ ${bin} ${printFlags.join(' ')} <prompt>\n`,
        })

        // Use spawn (not PTY) for non-interactive agent execution — no TUI escape codes
        const child = spawn('wsl.exe', ['--', 'bash', '-lc', fullCmd], {
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        activeChildProcesses.add(child)

        let output = ''
        const handleData = (chunk: Buffer): void => {
          const text = stripAnsi(chunk.toString())
          if (!text) return
          output = (output + text).slice(-8192)
          nodeOutputs.set(node.id, output)
          push(workflow.id, {
            type: 'node:output',
            workflowId: workflow.id,
            nodeId: node.id,
            message: text,
          })
        }

        child.stdout?.on('data', handleData)
        child.stderr?.on('data', handleData)

        child.on('close', (code) => {
          activeChildProcesses.delete(child)
          if (code === 0 || code === null) resolve()
          else reject(new Error(`Agent ${bin} exited with code ${code}`))
        })

        child.on('error', (err: Error) => {
          activeChildProcesses.delete(child)
          reject(err)
        })
      })
    }

    function runShellNode(node: WorkflowNode): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        const cmd = node.command ?? ''
        push(workflow.id, {
          type: 'node:output',
          workflowId: workflow.id,
          nodeId: node.id,
          message: `$ ${cmd}\n`,
        })

        // M8: Use projectPath as cwd context for shell commands
        const fullCmd = projectPath ? `cd "${projectPath}" && ${cmd}` : cmd

        const child = execFile(
          'wsl.exe',
          ['--', 'bash', '-c', fullCmd],
          { timeout: 60000 },
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

            push(workflow.id, {
              type: 'node:started',
              workflowId: workflow.id,
              nodeId: node.id,
              message: `Starting ${node.name}`,
            })

            try {
              if (node.type === 'agent') {
                await runAgentNode(node, contextSummary)
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
                push(workflow.id, {
                  type: 'node:resumed',
                  workflowId: workflow.id,
                  nodeId: node.id,
                  message: 'Resumed',
                })
              }

              push(workflow.id, {
                type: 'node:done',
                workflowId: workflow.id,
                nodeId: node.id,
                message: `${node.name} completed`,
              })
            } catch (err) {
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
        // C3: Clean up ptyBus listeners for all active sessions
        for (const sid of activeSessions) {
          ptyBus.removeAllListeners(`data:${sid}`)
          ptyBus.removeAllListeners(`exit:${sid}`)
          ptyManager.kill(sid)
        }
        activeSessions.clear()
        // C4: Kill all in-flight shell child processes
        for (const child of activeChildProcesses) {
          child.kill()
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
        log.error('Workflow execution error', { err: String(err) })
        push(workflow.id, {
          type: 'workflow:error',
          workflowId: workflow.id,
          message: String(err),
        })
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
  }
}
