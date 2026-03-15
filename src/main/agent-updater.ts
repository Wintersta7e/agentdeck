import { execFile } from 'child_process'
import type { BrowserWindow } from 'electron'
import { AGENTS, AGENT_BINARY_MAP } from '../shared/agents'
import { createLogger } from './logger'
import { NODE_INIT } from './wsl-utils'

const log = createLogger('agent-updater')

/** Semver extraction pattern */
const SEMVER_RE = /(\d+\.\d+\.\d+)/

export interface VersionInfo {
  agentId: string
  current: string | null
  latest: string | null
  updateAvailable: boolean
}

export interface UpdateResult {
  agentId: string
  success: boolean
  newVersion: string | null
  message: string
}

/**
 * Run a command inside WSL via bash login shell with nvm/fnm PATH init.
 * Returns stdout on success. Tolerates stderr noise (e.g. fnm warnings)
 * — only rejects if exit code is non-zero AND stdout is empty.
 */
function runWslCmd(cmd: string, timeout = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'wsl.exe',
      ['--', 'bash', '-lc', NODE_INIT + cmd],
      { timeout },
      (err, stdout, stderr) => {
        const out = stdout?.trim() ?? ''
        if (err) {
          // If we got usable stdout despite a non-zero exit, return it
          if (out) {
            log.debug(`Command had stderr but produced output`, { cmd, stderr: stderr?.trim() })
            resolve(out)
            return
          }
          reject(new Error(stderr?.trim() || err.message))
          return
        }
        resolve(out)
      },
    )
  })
}

/**
 * Check the current and latest versions of an agent.
 * Returns safe defaults (nulls, updateAvailable: false) on any error.
 */
export async function checkAgentVersion(agentId: string): Promise<VersionInfo> {
  const agent = AGENTS.find((a) => a.id === agentId)
  if (!agent) {
    return { agentId, current: null, latest: null, updateAvailable: false }
  }

  const binary = AGENT_BINARY_MAP[agentId] ?? agentId

  // Get current version — use installedCmd if provided (avoids PATH conflicts)
  let current: string | null = null
  try {
    const versionCmd =
      'installedCmd' in agent && agent.installedCmd
        ? agent.installedCmd
        : `${binary} ${agent.versionArgs.join(' ')}`
    const raw = await runWslCmd(versionCmd)
    const match = SEMVER_RE.exec(raw)
    current = match?.[1] ?? null
  } catch {
    log.debug(`Failed to get current version for ${agentId}`)
  }

  // Get latest version
  let latest: string | null = null
  try {
    const raw = await runWslCmd(agent.latestCmd)
    const match = SEMVER_RE.exec(raw)
    latest = match?.[1] ?? null
  } catch {
    log.debug(`Failed to get latest version for ${agentId}`)
  }

  const updateAvailable = current !== null && latest !== null && current !== latest

  log.info(`Version check: ${agentId}`, { current, latest, updateAvailable })

  return { agentId, current, latest, updateAvailable }
}

/**
 * Run the agent's update command and re-check the version afterward.
 */
export async function updateAgent(agentId: string): Promise<UpdateResult> {
  const agent = AGENTS.find((a) => a.id === agentId)
  if (!agent) {
    return { agentId, success: false, newVersion: null, message: 'Unknown agent' }
  }

  log.info(`Starting update for ${agentId}`)

  try {
    await runWslCmd(agent.updateCmd, 60000)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn(`Update failed for ${agentId}`, { message })
    return { agentId, success: false, newVersion: null, message }
  }

  // Re-check version after update
  const info = await checkAgentVersion(agentId)
  log.info(`Update complete for ${agentId}`, { newVersion: info.current })

  return {
    agentId,
    success: true,
    newVersion: info.current,
    message: info.current ? `Updated to ${info.current}` : 'Update completed',
  }
}

/**
 * Fire-and-forget version checks for all installed agents.
 * Each result is pushed to the renderer via IPC as it completes.
 */
export function checkAllUpdates(
  win: BrowserWindow,
  installedAgents: Record<string, boolean>,
): void {
  for (const agentId of Object.keys(installedAgents)) {
    if (!installedAgents[agentId]) continue

    void checkAgentVersion(agentId)
      .then((info) => {
        if (!win.isDestroyed()) {
          win.webContents.send('agents:versionInfo', info)
        }
      })
      .catch((err) => {
        log.warn(`Version check failed for ${agentId}`, { err: String(err) })
      })
  }
}
