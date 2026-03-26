/**
 * Extracted node runner functions for the workflow engine.
 *
 * runAgentNode and runShellNode were previously closures nested inside
 * runWorkflow(). They now take an explicit NodeRunnerDeps interface
 * instead of closing over parent-scope variables.
 */
import { spawn, execFile, type ChildProcess } from 'child_process'
import { createLogger } from './logger'
import type { WorkflowNode, WorkflowEvent, Role } from '../shared/types'
import { AGENT_BINARY_MAP, SAFE_FLAGS_RE } from '../shared/agents'
import { NODE_INIT } from './wsl-utils'

const log = createLogger('node-runners')

// ── Constants ────────────────────────────────────────────────────────

/** Non-interactive / print-mode CLI flags per agent (prompt follows as last arg) */
export const AGENT_PRINT_FLAGS: Record<string, string[]> = {
  'claude-code': ['--print'],
  codex: ['exec'],
  aider: ['--message'],
  goose: ['run', '-t'],
  'gemini-cli': ['-p'],
  'amazon-q': ['chat', '--no-interactive', '--trust-all-tools'],
  opencode: ['run'],
}

/** Agents that support a native --cd / -C flag for setting working directory.
 *  These use the flag instead of shell `cd`, which is more reliable. */
const AGENT_CD_FLAG: Record<string, string> = {
  codex: '-C',
  'claude-code': '--directory',
}

/** Extra flags injected by the engine (not user-configured).
 *  These handle workflow-specific needs like non-git project dirs. */
const AGENT_ENGINE_FLAGS: Record<string, string[]> = {
  codex: ['--skip-git-repo-check'],
}

const MINUTES = 60_000

/** How long an agent node can be idle (no stdout/stderr) before being killed */
export const AGENT_IDLE_TIMEOUT = 5 * MINUTES

/** How often to check whether an agent node has gone idle */
const IDLE_CHECK_INTERVAL = 0.5 * MINUTES

/** Max number of nodes to run concurrently within a single tier */
export const MAX_TIER_CONCURRENCY = 5

/** How often to flush the line buffer even without a newline */
const LINE_FLUSH_MS = 500

// ── Utility functions ────────────────────────────────────────────────

/**
 * Force-kill a child process tree on Windows.
 * `child.kill()` only terminates wsl.exe — the Linux process inside WSL
 * survives as an orphan. Use taskkill /F /T to kill the entire tree.
 */
export function forceKillTree(child: ChildProcess): void {
  const pid = child.pid
  if (pid === undefined || pid === null) {
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

// ── NodeRunnerDeps ───────────────────────────────────────────────────

/** Dependency injection interface for runAgentNode / runShellNode. */
export interface NodeRunnerDeps {
  workflowId: string
  projectPath: string | undefined
  push: (event: Omit<WorkflowEvent, 'id' | 'timestamp'>) => void
  nodeOutputs: Map<string, string>
  conditionOutputs: Map<string, string>
  nodeExitCodes: Map<string, number>
  activeChildProcesses: Set<ChildProcess>
  isStopped: () => boolean
}

// ── Node runners ─────────────────────────────────────────────────────

export function runAgentNode(
  node: WorkflowNode,
  contextSummary: string,
  roles: Map<string, Role>,
  deps: NodeRunnerDeps,
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
        deps.push({
          type: 'node:output',
          workflowId: deps.workflowId,
          nodeId: node.id,
          message: `\u26a0 Agent flags rejected (unsafe): ${node.agentFlags}`,
        })
      }
    }

    // Build non-interactive command: run agent in print mode with project directory
    // For agents with native --cd (codex -C, claude --directory), the flag goes AFTER
    // the subcommand (e.g. `codex exec -C /path '<prompt>'`), not before it.
    const parts: string[] = []
    const cdFlag = AGENT_CD_FLAG[agentName]
    if (deps.projectPath && !cdFlag) parts.push(`cd ${shellQuote(deps.projectPath)}`)
    const flagStr = printFlags.length > 0 ? printFlags.join(' ') + ' ' : ''
    const cdFlagStr = deps.projectPath && cdFlag ? `${cdFlag} ${shellQuote(deps.projectPath)} ` : ''
    const engineFlags = AGENT_ENGINE_FLAGS[agentName]
    const engineFlagStr = engineFlags ? engineFlags.join(' ') + ' ' : ''
    parts.push(
      `${shellQuote(bin)} ${flagStr}${cdFlagStr}${engineFlagStr}${shellQuote(prompt)}${sanitizedFlags}`,
    )
    const fullCmd = parts.join(' && ')

    deps.push({
      type: 'node:output',
      workflowId: deps.workflowId,
      nodeId: node.id,
      message: `$ ${bin} ${flagStr}<prompt>\n`,
    })

    // Use spawn (not PTY) for non-interactive agent execution — no TUI escape codes.
    // bash -lc (login, non-interactive) with explicit nvm/fnm init so WSL node
    // binaries are found instead of broken Windows npm wrappers. We can't use
    // -lic (interactive) because it dumps shell init noise into the output.
    // stdin must be 'pipe' (not 'ignore') — WSL rejects /dev/null stdin with
    // E_UNEXPECTED. We close the pipe immediately after spawn.
    const startTime = Date.now()
    const child = spawn('wsl.exe', ['--', 'bash', '-lc', NODE_INIT + fullCmd], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    child.stdin?.end()
    deps.activeChildProcesses.add(child)

    let output = ''
    let lineBuf = ''
    const emitLine = (text: string): void => {
      deps.push({
        type: 'node:output',
        workflowId: deps.workflowId,
        nodeId: node.id,
        message: text,
      })
    }
    const flushLines = (text: string): void => {
      lineBuf += text
      const segments = lineBuf.split('\n')
      lineBuf = segments.pop() ?? ''
      for (const line of segments) {
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
      deps.nodeOutputs.set(node.id, output)
      // WF-2: conditionOutputs stores up to 64KB for condition evaluation
      const existing = deps.conditionOutputs.get(node.id) ?? ''
      deps.conditionOutputs.set(node.id, (existing + text).slice(-65536))
      flushLines(text)
    }

    child.stdout?.on('data', handleData)
    child.stderr?.on('data', handleData)

    // Idle timeout: kill agent if it produces no output for AGENT_IDLE_TIMEOUT ms
    const idleCheckTimer = setInterval(() => {
      const idleMs = Date.now() - lastActivityTime
      if (idleMs >= AGENT_IDLE_TIMEOUT) {
        log.warn('Agent node idle timeout', {
          workflowId: deps.workflowId,
          nodeId: node.id,
          agent: bin,
          idleMs,
        })
        forceKillTree(child)
        clearInterval(flushTimer)
        clearInterval(idleCheckTimer)
        clearTimeout(absoluteTimer)
        deps.activeChildProcesses.delete(child)
        settleReject(new Error(`Agent ${bin} idle for ${Math.round(idleMs / 1000)}s — no output`))
      }
    }, IDLE_CHECK_INTERVAL)

    // Optional absolute timeout: only if the user set node.timeout explicitly
    const absoluteTimer = node.timeout
      ? setTimeout(() => {
          log.warn('Agent node absolute timeout', {
            workflowId: deps.workflowId,
            nodeId: node.id,
            agent: bin,
            timeoutMs: node.timeout,
          })
          forceKillTree(child)
          clearInterval(flushTimer)
          clearInterval(idleCheckTimer)
          deps.activeChildProcesses.delete(child)
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
      deps.activeChildProcesses.delete(child)
      deps.nodeExitCodes.set(node.id, code ?? 1)
      // Flush any remaining partial line
      const remaining = lineBuf.trim()
      if (remaining) emitLine(remaining)
      if (code === 0 || code === null) settleResolve()
      else {
        const elapsed = Date.now() - startTime
        const hint =
          elapsed < 2000 && !output
            ? ' (exited immediately — check that the agent is installed and a project directory is selected)'
            : ''
        settleReject(new Error(`Agent ${bin} exited with code ${code}${hint}`))
      }
    })

    child.on('error', (err: Error) => {
      clearInterval(idleCheckTimer)
      clearTimeout(absoluteTimer)
      clearInterval(flushTimer)
      deps.activeChildProcesses.delete(child)
      settleReject(err)
    })
  })
}

export function runShellNode(node: WorkflowNode, deps: NodeRunnerDeps): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // Convert literal \n sequences to real newlines so multi-line commands
    // (e.g. python3 -c "def f():\n  return 1") execute correctly in bash.
    const cmd = (node.command ?? '').replace(/\\n/g, '\n')
    deps.push({
      type: 'node:output',
      workflowId: deps.workflowId,
      nodeId: node.id,
      message: `$ ${node.command ?? ''}\n`,
    })

    // M8: Use projectPath as cwd context for shell commands
    const fullCmd = deps.projectPath ? `cd ${shellQuote(deps.projectPath)} && ${cmd}` : cmd

    const child = execFile(
      'wsl.exe',
      ['--', 'bash', '-lc', NODE_INIT + fullCmd],
      { timeout: node.timeout ?? 60000 },
      (err, stdout, stderr) => {
        deps.activeChildProcesses.delete(child)
        deps.nodeExitCodes.set(node.id, err ? 1 : 0)
        const out = stripAnsi(stdout + stderr)
        deps.nodeOutputs.set(node.id, out)
        deps.conditionOutputs.set(node.id, out.slice(-65536))
        deps.push({
          type: 'node:output',
          workflowId: deps.workflowId,
          nodeId: node.id,
          message: out,
        })
        if (err) reject(err)
        else resolve()
      },
    )
    // C4: Track child process so stop() can kill it
    deps.activeChildProcesses.add(child)
  })
}
