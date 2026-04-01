import { execFile } from 'child_process'
import type { BrowserWindow } from 'electron'
import { AGENTS, AGENT_BINARY_MAP } from '../shared/agents'
import { createLogger } from './logger'
import { NODE_INIT } from './wsl-utils'
import { shellQuote } from './node-runners'

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
 * Check whether an agent binary is findable on the WSL PATH.
 * Returns true if `command -v <binary>` succeeds.
 */
async function isBinaryOnPath(binary: string): Promise<boolean> {
  try {
    await runWslCmd(`command -v ${binary}`)
    return true
  } catch {
    return false
  }
}

/** Extract the npm package name from an updateCmd like "npm install -g @openai/codex@latest" */
function extractNpmPackage(updateCmd: string): string | null {
  const match = /npm install\s+-g\s+((?:@[\w-]+\/)?[\w-]+)/.exec(updateCmd)
  return match?.[1] ?? null
}

/**
 * Repair missing npm bin symlink — a known issue with packages that use
 * platform-specific optional dependencies (e.g. @openai/codex v0.100+).
 *
 * npm may install the package but fail to create the bin link when optional
 * deps for the current platform aren't resolved.
 *
 * Uses `node -e` with `process.execPath` to derive the correct prefix,
 * because `npm prefix -g` can return the wrong path when nvm fails to
 * activate in non-interactive login shells (bash -lc).
 *
 * @see https://github.com/openai/codex/issues/13555
 */
async function repairNpmBinLink(binary: string, updateCmd: string): Promise<boolean> {
  const pkg = extractNpmPackage(updateCmd)
  if (!pkg) return false

  try {
    // Use node's own process.execPath to derive prefix — this is always correct
    // even when nvm's PATH setup fails in bash -lc, because process.execPath
    // resolves to the actual nvm-managed node binary, not /usr/bin/node.
    // BUG-2: Derive bin entry from package.json instead of hardcoding .js suffix.
    // This handles agents whose npm package uses .cjs or a different filename.
    const nodeScript = [
      `const p=require("path"),fs=require("fs")`,
      `const prefix=p.dirname(p.dirname(process.execPath))`,
      `const pkgDir=p.join(prefix,"lib/node_modules",${JSON.stringify(pkg)})`,
      `const pj=JSON.parse(fs.readFileSync(p.join(pkgDir,"package.json"),"utf-8"))`,
      `const bins=typeof pj.bin==="string"?{[pj.name?.split("/").pop()||""]:pj.bin}:(pj.bin||{})`,
      `const entry=bins[${JSON.stringify(binary)}]||Object.values(bins)[0]`,
      `if(!entry){console.error("no bin entry for ${binary}");process.exit(1)}`,
      `const src=p.join(pkgDir,entry)`,
      `const dst=p.join(prefix,"bin",${JSON.stringify(binary)})`,
      `if(!fs.existsSync(src)){console.error("src missing: "+src);process.exit(1)}`,
      `try{fs.unlinkSync(dst)}catch{}`,
      `fs.symlinkSync(src,dst)`,
      `console.log("repaired")`,
    ].join(';')

    // SEC-31: Use shellQuote to safely escape the script instead of raw single-quote wrapping
    const result = await runWslCmd(`node -e ${shellQuote(nodeScript)}`)
    if (result.includes('repaired')) {
      log.info(`Repaired missing npm bin link for ${binary}`)
      return true
    }
  } catch (err) {
    log.warn(`Bin link repair failed for ${binary}`, {
      err: err instanceof Error ? err.message : String(err),
    })
  }

  return false
}

/**
 * Run the agent's update command and re-check the version afterward.
 *
 * For npm agents, resolves the exact latest version from the registry first
 * and installs that specific version instead of relying on `@latest` dist-tag
 * resolution, which can use stale npm packument cache.
 *
 * Safety: verifies the binary still exists after the update. If npm removed
 * the binary (e.g. failed install, package rename, changed bin mapping),
 * attempts to rollback to the previous version.
 */
export async function updateAgent(agentId: string): Promise<UpdateResult> {
  const agent = AGENTS.find((a) => a.id === agentId)
  if (!agent) {
    return { agentId, success: false, newVersion: null, message: 'Unknown agent' }
  }

  const binary = AGENT_BINARY_MAP[agentId] ?? agentId

  // Snapshot current state before update (for rollback and diagnostics)
  const preInfo = await checkAgentVersion(agentId)

  // Resolve the actual latest version from the registry before installing.
  // npm's @latest dist-tag resolution can use stale packument cache, so we
  // resolve the version explicitly via `npm view` and install @<version>.
  let targetVersion: string | null = null
  if (agent.latestCmd) {
    try {
      const raw = await runWslCmd(agent.latestCmd)
      const match = SEMVER_RE.exec(raw)
      targetVersion = match?.[1] ?? null
    } catch {
      log.debug(`Failed to resolve latest version for ${agentId}, falling back to updateCmd`)
    }
  }

  // Replace @latest with the specific version to bypass dist-tag cache
  let updateCmd: string = agent.updateCmd
  if (targetVersion && updateCmd.includes('@latest')) {
    updateCmd = updateCmd.replace('@latest', `@${targetVersion}`)
  }

  log.info(`Starting update for ${agentId}`, {
    targetVersion,
    cmd: updateCmd,
    previousVersion: preInfo.current,
  })

  try {
    await runWslCmd(updateCmd, 120_000)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn(`Update failed for ${agentId}`, { message })
    return { agentId, success: false, newVersion: null, message }
  }

  // Critical safety check: verify the binary still exists after update.
  // npm install -g can remove the old binary before installing the new one.
  // If the new install fails or changes the bin mapping, the binary is gone.
  let binaryStillExists = await isBinaryOnPath(binary)

  // Auto-repair: npm packages with platform-specific optional deps (e.g. @openai/codex)
  // can install successfully but fail to create the bin symlink.
  if (!binaryStillExists && agent.updateCmd.includes('npm install')) {
    log.warn(`Binary '${binary}' missing after update — attempting bin link repair`)
    const repaired = await repairNpmBinLink(binary, updateCmd)
    if (repaired) {
      binaryStillExists = await isBinaryOnPath(binary)
    }
  }

  if (!binaryStillExists) {
    log.error(`Binary '${binary}' disappeared after updating ${agentId}!`, {
      previousVersion: preInfo.current,
      targetVersion,
    })

    // Attempt rollback for npm agents (those with @latest in updateCmd)
    let rollbackAttempted = false
    if (preInfo.current && agent.updateCmd.includes('@latest')) {
      rollbackAttempted = true
      const rollbackCmd = agent.updateCmd.replace('@latest', `@${preInfo.current}`)
      log.warn(`Attempting rollback: ${rollbackCmd}`)
      try {
        await runWslCmd(rollbackCmd, 120_000)
        let recovered = await isBinaryOnPath(binary)

        // npm can reinstall the package but still fail to create the bin link.
        // Attempt repair after rollback — this is the common case.
        if (!recovered) {
          log.warn(`Binary '${binary}' still missing after rollback — attempting bin link repair`)
          const repaired = await repairNpmBinLink(binary, rollbackCmd)
          if (repaired) {
            recovered = await isBinaryOnPath(binary)
          }
        }

        if (recovered) {
          log.info(`Rollback succeeded for ${agentId} — restored v${preInfo.current}`)
          return {
            agentId,
            success: false,
            newVersion: preInfo.current,
            message: `Update removed the ${binary} binary. Rolled back to v${preInfo.current}. The target version may be incompatible.`,
          }
        }
        log.error(
          `Rollback installed package but binary '${binary}' still missing after repair attempts`,
        )
      } catch (rollbackErr) {
        log.error(`Rollback also failed for ${agentId}`, {
          err: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
        })
      }
    }

    return {
      agentId,
      success: false,
      newVersion: null,
      message: `Update removed the ${binary} binary.${rollbackAttempted ? ' Rollback was attempted but failed.' : ''} Please reinstall manually: ${agent.updateCmd}`,
    }
  }

  // Re-check installed version after update
  const info = await checkAgentVersion(agentId)

  // Verify the version actually changed to the target
  if (targetVersion && info.current && info.current !== targetVersion) {
    log.warn(`Update ran but version did not change`, {
      expected: targetVersion,
      actual: info.current,
    })
    return {
      agentId,
      success: false,
      newVersion: info.current,
      message: `Installed ${info.current} but registry has ${targetVersion}. The agent binary on PATH may differ from the npm global install.`,
    }
  }

  // Binary exists but version undetectable — cautious success
  if (!info.current) {
    log.warn(`Update completed but could not verify version for ${agentId}`)
    return {
      agentId,
      success: true,
      newVersion: null,
      message: 'Update completed but version could not be verified',
    }
  }

  log.info(`Update complete for ${agentId}`, { newVersion: info.current })

  return {
    agentId,
    success: true,
    newVersion: info.current,
    message: `Updated to ${info.current}`,
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
