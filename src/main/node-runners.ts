/**
 * Extracted node runner functions for the workflow engine.
 *
 * runAgentNode and runShellNode were previously closures nested inside
 * runWorkflow(). They now take an explicit NodeRunnerDeps interface
 * instead of closing over parent-scope variables.
 */
import { spawn, execFile, type ChildProcess, type ExecException } from 'child_process'
import { createLogger } from './logger'
import type { AgentNode, ShellNode, WorkflowEventInput, Role } from '../shared/types'
import {
  AGENT_BY_ID,
  AGENT_CD_FLAG_MAP,
  AGENT_ENGINE_FLAGS_MAP,
  AGENT_SUPPORTS_SKILLS_MAP,
  SAFE_FLAGS_RE,
  getPermissionFlags,
} from '../shared/agents'
import type { AgentRegistry } from './agent-registry'
import {
  AGENT_IDLE_TIMEOUT,
  DEFAULT_AGENT_TIMEOUT,
  IDLE_CHECK_INTERVAL,
  LINE_FLUSH_MS,
  MAX_TIER_CONCURRENCY,
} from '../shared/constants'
import { NODE_INIT, peekWindowsHostIp, substituteWindowsHost } from './wsl-utils'
import { SAFE_SKILL_RE } from './skill-scanner'
import { BLOCKED_ENV_KEYS } from '../shared/custom-agents'

const log = createLogger('node-runners')

// Re-export for callers that previously imported these from this module.
export { AGENT_IDLE_TIMEOUT, MAX_TIER_CONCURRENCY }

/** Max stdout+stderr a shell node may buffer before execFile aborts it.
 *  Node's 1 MiB default is too small for verbose build/test logs. */
const SHELL_MAX_BUFFER = 16 * 1024 * 1024

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

import { stripAnsi } from '../shared/ansi'
export { stripAnsi }
export { shellQuote } from './wsl-exec'
import { shellQuote } from './wsl-exec'

// ── Skill prefix extraction ──────────────────────────────────────────

/**
 * Extract a skill invocation prefix from a compound skillId. Returns the
 * prefix string (e.g. "$lint-fix ") or null if the skillId is missing,
 * malformed, or the agent doesn't declare `supportsSkills` in the registry.
 */
export function extractSkillPrefix(skillId: string | undefined, agentName: string): string | null {
  if (!skillId || !AGENT_SUPPORTS_SKILLS_MAP[agentName]) return null
  const name = skillId.split(':').pop() ?? ''
  if (SAFE_SKILL_RE.test(name) && name.length > 0) return `$${name} `
  return null
}

// ── NodeRunnerDeps ───────────────────────────────────────────────────

/** Dependency injection interface for runAgentNode / runShellNode. */
export interface NodeRunnerDeps {
  workflowId: string
  projectPath: string | undefined
  push: (event: WorkflowEventInput) => void
  nodeOutputs: Map<string, string>
  conditionOutputs: Map<string, string>
  nodeExitCodes: Map<string, number>
  activeChildProcesses: Set<ChildProcess>
  isStopped: () => boolean
  /** Merged builtin + custom agent registry: id membership, binary, args, custom flag. */
  agentRegistry: AgentRegistry
}

// ── Node runners ─────────────────────────────────────────────────────

/** Session cache of resolved PATH dir prefixes, keyed by agent binary name. */
const agentPathCache = new Map<string, string>()

/** Drop the per-session agent PATH-resolution cache (after an agent update, or between tests). */
export function invalidateAgentPathCache(): void {
  agentPathCache.clear()
}

/**
 * Resolve the directories containing the agent binary and `node`, using an
 * INTERACTIVE login shell (`bash -lic`) which sources ~/.bashrc — hence the
 * user's nvm/fnm/volta PATH. The runner uses non-interactive `bash -lc` (clean
 * output), which does NOT source ~/.bashrc, so nvm-installed CLIs like codex,
 * and `node` (needed by codex's `#!/usr/bin/env node` shebang), are otherwise
 * absent from PATH. Returns a colon-joined list of absolute dirs to prepend to
 * PATH, or '' if unresolved. Parses only absolute paths (ignores shell-init
 * noise / stderr). Cached per binary for the session. `bin` can be a custom
 * agent's binary (arbitrary user string), so it is shell-quoted before being
 * spliced into the `bash -lic` command line.
 */
function resolveAgentPathPrefix(bin: string): Promise<string> {
  const cached = agentPathCache.get(bin)
  if (cached !== undefined) return Promise.resolve(cached)
  return new Promise<string>((resolve) => {
    execFile(
      'wsl.exe',
      [
        '--',
        'bash',
        '-lic',
        `command -v ${shellQuote(bin)} 2>/dev/null; command -v node 2>/dev/null`,
      ],
      { timeout: 15_000 },
      (_err, stdout) => {
        const dirs: string[] = []
        for (const line of (stdout ?? '').split('\n')) {
          const p = line.trim()
          if (!p.startsWith('/')) continue
          const slash = p.lastIndexOf('/')
          const dir = slash > 0 ? p.slice(0, slash) : ''
          if (dir && !dirs.includes(dir)) dirs.push(dir)
        }
        const prefix = dirs.join(':')
        agentPathCache.set(bin, prefix)
        resolve(prefix)
      },
    )
  })
}

export async function runAgentNode(
  node: AgentNode,
  contextSummary: string,
  roles: Map<string, Role>,
  deps: NodeRunnerDeps,
): Promise<void> {
  // Build prompt: [role persona] + [task prompt] + [output format] + [context]
  const role = node.roleId ? roles.get(node.roleId) : undefined
  const promptParts: string[] = []
  if (role?.persona) promptParts.push(role.persona)
  if (node.prompt) promptParts.push(node.prompt)
  if (role?.outputFormat) promptParts.push(`Output format:\n${role.outputFormat}`)
  if (contextSummary) promptParts.push(`Context from previous steps:\n${contextSummary}`)
  let prompt = promptParts.join('\n\n')

  const agentName = node.agent ?? 'claude-code'
  if (!deps.agentRegistry.has(agentName)) {
    // Loud-fail on unknown agents instead of falling through to a `?? agentName`
    // footgun that would silently invoke whatever string the renderer sent as a
    // binary name. Membership covers both builtins and registered custom agents.
    throw new Error(`Unknown agent: ${agentName}`)
  }

  // Prepend skill invocation prefix if the agent declares supportsSkills.
  const skillPrefix = extractSkillPrefix(node.skillId, agentName)
  if (skillPrefix) {
    prompt = skillPrefix + prompt
  } else if (node.skillId && AGENT_SUPPORTS_SKILLS_MAP[agentName]) {
    // Skill name failed validation
    deps.push({
      type: 'node:output',
      workflowId: deps.workflowId,
      nodeId: node.id,
      message: '⚠ Skill name rejected (unsafe): ' + (node.skillId.split(':').pop() ?? ''),
    })
  }

  if (!prompt) return

  const bin = deps.agentRegistry.binaryFor(agentName)
  if (bin === undefined) {
    // Membership already guaranteed a binary; this satisfies the type and
    // guards against a registry that knows the id but has no binary for it.
    throw new Error(`No binary registered for agent: ${agentName}`)
  }
  // Custom agents are console/TUI agents with no headless --print mode, so they
  // get no print flags; their default launch args (argsFor) are appended
  // instead. Builtins keep their canonical print-mode flags exactly.
  const isCustom = deps.agentRegistry.isCustom(agentName)
  const printFlags: readonly string[] = isCustom
    ? []
    : (AGENT_BY_ID.get(agentName)?.printFlags ?? ['--print'])
  const customArgs = isCustom ? deps.agentRegistry.argsFor(agentName) : []

  // {{WINDOWS_HOST}} resolves to the WSL gateway IP (the Windows host) in custom-agent
  // env values and default args — mirrors the PTY session path so a Windows-side agent
  // behaves identically in a workflow node. Warmed at startup; null leaves the token.
  const hostIp = peekWindowsHostIp()
  const subHost = (s: string): string => (hostIp ? substituteWindowsHost(s, hostIp) : s)

  let sanitizedFlags = ''
  if (node.agentFlags) {
    if (SAFE_FLAGS_RE.test(node.agentFlags)) {
      sanitizedFlags = ` ${node.agentFlags}`
    } else {
      deps.push({
        type: 'node:output',
        workflowId: deps.workflowId,
        nodeId: node.id,
        message: `⚠ Agent flags rejected (unsafe): ${node.agentFlags}`,
      })
    }
  }

  // Resolve the dirs containing the agent binary AND node from an interactive
  // login shell (which sources ~/.bashrc, hence the user's nvm/fnm/volta PATH).
  // The runner below uses non-interactive `bash -lc` (clean output) which does
  // NOT source ~/.bashrc, so nvm-installed CLIs (codex) and node are otherwise
  // off PATH. We inject the resolved literal dirs — simple + transport-safe.
  const pathPrefix = await resolveAgentPathPrefix(bin)

  // Build non-interactive command. The prompt is delivered over the child's
  // stdin (below), NOT on the command line — neither shell-quoting nor base64
  // survives the Windows spawn -> wsl.exe -> Linux argv transport intact, so the
  // prompt's tokens would get parsed/executed by bash (exit 2/127). Keep this
  // command simple (no globs / case / $()) for the same transport reason.
  // For agents with native --cd (codex -C, claude --directory), the flag goes
  // AFTER the subcommand (e.g. `codex exec -C /path`), not before it.
  const pathExport = pathPrefix ? `export PATH="${pathPrefix}:$PATH"; ` : ''
  const cdFlag = AGENT_CD_FLAG_MAP[agentName]
  const flagStr = printFlags.length > 0 ? printFlags.join(' ') + ' ' : ''
  // Custom-agent launch args (arbitrary user strings) shell-quoted individually.
  const customArgsStr =
    customArgs.length > 0 ? customArgs.map((a) => shellQuote(subHost(a))).join(' ') + ' ' : ''
  const cdFlagStr = deps.projectPath && cdFlag ? `${cdFlag} ${shellQuote(deps.projectPath)} ` : ''
  const engineFlags = AGENT_ENGINE_FLAGS_MAP[agentName]
  const engineFlagStr = engineFlags ? engineFlags.join(' ') + ' ' : ''
  const permission = node.type === 'agent' ? (node.permission ?? 'read') : 'read'
  const permFlags = getPermissionFlags(agentName, permission)
  const permFlagStr = permFlags.length > 0 ? permFlags.join(' ') + ' ' : ''
  const runParts: string[] = []
  if (deps.projectPath && !cdFlag) runParts.push(`cd ${shellQuote(deps.projectPath)}`)
  runParts.push(
    `${shellQuote(bin)} ${flagStr}${customArgsStr}${cdFlagStr}${engineFlagStr}${permFlagStr}${sanitizedFlags}`.trimEnd(),
  )
  const fullCmd = pathExport + runParts.join(' && ')

  deps.push({
    type: 'node:output',
    workflowId: deps.workflowId,
    nodeId: node.id,
    message: `$ ${bin} ${flagStr}<prompt>\n`,
  })

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

    // Use spawn (not PTY) for non-interactive agent execution — no TUI escape codes.
    // bash -lc (login, non-interactive) with explicit nvm/fnm init so WSL node
    // binaries are found instead of broken Windows npm wrappers. We can't use
    // -lic (interactive) because it dumps shell init noise into the output.
    // stdin must be 'pipe' (not 'ignore') — WSL rejects /dev/null stdin with
    // E_UNEXPECTED. We write the prompt to stdin (NODE_INIT does not consume it),
    // then close the pipe so the agent sees EOF.
    const startTime = Date.now()
    // A custom agent's env (incl. decrypted secretEnv) must reach the workflow child
    // the same way it reaches a PTY session — via the child's env option, never
    // serialized into the bash command string, so a secret never appears on the
    // command line. Builtins contribute {} here. Filter BLOCKED_ENV_KEYS as
    // defense-in-depth against an edited agents.toml (mirrors pty-manager).
    // Spreading process.env keeps the runner's nvm/PATH.
    const mergedEnv: NodeJS.ProcessEnv = { ...process.env }
    if (isCustom) {
      const customEnv = {
        ...deps.agentRegistry.envFor(agentName),
        ...deps.agentRegistry.secretEnvFor(agentName),
      }
      for (const [k, v] of Object.entries(customEnv)) {
        if (BLOCKED_ENV_KEYS.has(k)) continue
        mergedEnv[k] = subHost(v)
      }
    }
    const child = spawn('wsl.exe', ['--', 'bash', '-lc', NODE_INIT + fullCmd], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: mergedEnv,
    })
    child.stdin?.write(prompt)
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
      // conditionOutputs stores up to 64KB for condition evaluation
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

    const effectiveTimeout = node.timeout ?? DEFAULT_AGENT_TIMEOUT
    const absoluteTimer = setTimeout(() => {
      const isDefault = !node.timeout
      log.warn('Agent node absolute timeout', {
        workflowId: deps.workflowId,
        nodeId: node.id,
        agent: bin,
        timeoutMs: effectiveTimeout,
        isDefault,
      })
      forceKillTree(child)
      clearInterval(flushTimer)
      clearInterval(idleCheckTimer)
      deps.activeChildProcesses.delete(child)
      const label = isDefault ? 'default limit' : 'absolute limit'
      settleReject(new Error(`Agent ${bin} timed out after ${effectiveTimeout / 1000}s (${label})`))
    }, effectiveTimeout)

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

export function runShellNode(node: ShellNode, deps: NodeRunnerDeps): Promise<void> {
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

    // Use projectPath as cwd context for shell commands
    const fullCmd = deps.projectPath ? `cd ${shellQuote(deps.projectPath)} && ${cmd}` : cmd

    const timeoutMs = node.timeout ?? 60000
    let settled = false

    const child = execFile(
      'wsl.exe',
      ['--', 'bash', '-lc', NODE_INIT + fullCmd],
      // No execFile `timeout`: it only SIGTERMs wsl.exe and orphans the Linux
      // process inside WSL — we enforce it ourselves via forceKillTree below.
      // A generous maxBuffer keeps a chatty-but-successful command (verbose
      // build/test logs) from being killed and misreported as a failure.
      { maxBuffer: SHELL_MAX_BUFFER },
      (err, stdout, stderr) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        deps.activeChildProcesses.delete(child)
        // execFile surfaces the OS exit code as a number; a non-numeric code
        // (e.g. 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' when maxBuffer overflows)
        // means Node killed the child — treat it as a generic failure rather
        // than letting a string leak into the numeric exit-code map.
        const raw = (err as ExecException | null)?.code
        const exitCode = typeof raw === 'number' ? raw : err ? 1 : 0
        deps.nodeExitCodes.set(node.id, exitCode)
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

    // Enforce the timeout by killing the whole WSL process tree (taskkill /F /T),
    // mirroring the agent-node path. 124 is the conventional timeout exit code.
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      log.warn('Shell node timeout', { workflowId: deps.workflowId, nodeId: node.id, timeoutMs })
      forceKillTree(child)
      deps.activeChildProcesses.delete(child)
      deps.nodeExitCodes.set(node.id, 124)
      reject(new Error(`Shell command timed out after ${timeoutMs / 1000}s`))
    }, timeoutMs)

    // Track child process so stop() can kill it
    deps.activeChildProcesses.add(child)
  })
}
