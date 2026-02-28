import { BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import { EventEmitter } from 'events'
import { createLogger } from './logger'
import type { PtyManager } from './pty-manager'
import type { Workflow, WorkflowNode, WorkflowEdge, WorkflowEvent } from '../shared/types'

const log = createLogger('workflow-engine')

export interface WorkflowEngine {
  run: (workflow: Workflow, projectPath?: string) => void
  stop: (workflowId: string) => void
  resume: (workflowId: string, nodeId: string) => void
}

/**
 * Internal event bus for PTY data/exit events.
 *
 * pty-manager.ts sends data to the renderer via `webContents.send()`, which
 * is a one-way main→renderer IPC channel that does NOT fire events on the
 * main-process EventEmitter.  To let the workflow engine (which lives in
 * the main process) capture PTY output, pty-manager should also emit on
 * this bus:
 *
 *   ptyBus.emit(`data:${sessionId}`, data)
 *   ptyBus.emit(`exit:${sessionId}`, exitCode)
 *
 * Until that integration is wired, agent nodes will resolve on PTY exit
 * without capturing intermediate output.
 */
export const ptyBus = new EventEmitter()
ptyBus.setMaxListeners(100)

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
  const activeRuns = new Map<string, { stop: () => void }>()
  const checkpoints = new Map<string, () => void>()

  function push(workflowId: string, event: Omit<WorkflowEvent, 'id' | 'timestamp'>): void {
    if (mainWindow.isDestroyed()) return
    mainWindow.webContents.send(`workflow:event:${workflowId}`, {
      ...event,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    })
  }

  function runWorkflow(workflow: Workflow, projectPath?: string): void {
    let stopped = false
    const nodeOutputs = new Map<string, string>()
    const activeSessions = new Set<string>()

    function runAgentNode(node: WorkflowNode, contextSummary: string): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        const sessionId = `wf-${workflow.id}-${node.id}-${Date.now()}`

        const startupPrompt = [
          node.prompt,
          contextSummary ? `\n\nContext from previous steps:\n${contextSummary}` : '',
        ]
          .filter(Boolean)
          .join('')

        const startupCommands = startupPrompt
          ? [`echo "### Workflow context ###" && echo ${JSON.stringify(startupPrompt)}`]
          : []

        // Listen on the internal ptyBus for data/exit from this session.
        // pty-manager emits: ptyBus.emit(`data:${sessionId}`, data)
        //                    ptyBus.emit(`exit:${sessionId}`, exitCode)
        const dataChannel = `data:${sessionId}`
        const exitChannel = `exit:${sessionId}`

        const onData = (data: string): void => {
          const current = nodeOutputs.get(node.id) ?? ''
          nodeOutputs.set(node.id, (current + data).slice(-8192))
          push(workflow.id, {
            type: 'node:output',
            workflowId: workflow.id,
            nodeId: node.id,
            message: data,
          })
        }

        const onExit = (code: number): void => {
          ptyBus.removeListener(dataChannel, onData)
          ptyBus.removeListener(exitChannel, onExit)
          activeSessions.delete(sessionId)
          if (code === 0 || code === null) resolve()
          else reject(new Error(`Agent exited with code ${code}`))
        }

        ptyBus.on(dataChannel, onData)
        ptyBus.on(exitChannel, onExit)
        activeSessions.add(sessionId)

        ptyManager.spawn(
          sessionId,
          220,
          50,
          projectPath,
          startupCommands,
          {},
          node.agent,
          node.agentFlags,
        )
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

        execFile(
          'wsl.exe',
          ['--', 'bash', '-c', cmd],
          { timeout: 60000 },
          (err, stdout, stderr) => {
            const out = stdout + stderr
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
      })
    }

    function onCheckpoint(nodeId: string): Promise<void> {
      return new Promise<void>((resolve) => {
        checkpoints.set(nodeId, resolve)
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
        for (const sid of activeSessions) {
          ptyManager.kill(sid)
        }
        activeSessions.clear()
        for (const [, resolve] of checkpoints) {
          resolve()
        }
        checkpoints.clear()
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
    resume: (_workflowId: string, nodeId: string) => {
      const resolve = checkpoints.get(nodeId)
      if (resolve) {
        checkpoints.delete(nodeId)
        resolve()
      }
    },
  }
}
