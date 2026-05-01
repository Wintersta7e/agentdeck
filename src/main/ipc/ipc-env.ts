import { ipcMain } from 'electron'
import { getAgentSnapshot } from '../agent-env-resolver'
import { getDefaultDistroAsync } from '../wsl-utils'
import { getWslHome } from '../wsl-paths'
import { createLogger } from '../logger'
import { SAFE_ID_RE } from '../validation'
import { KNOWN_AGENT_IDS } from '../../shared/agents'
import type { AgentEnvSnapshot } from '../../shared/types'

const log = createLogger('ipc-env')

export interface EnvCtx {
  /** Value of `$CLAUDE_CONFIG_DIR` at process start, or null if unset. */
  claudeConfigDir: string | null
  /** Value of `$CODEX_HOME` at process start, or null if unset. */
  codexHome: string | null
  /** The AgentDeck user-scope root, typically `$WSL_HOME/.agentdeck`. */
  agentdeckRoot: string
  /** Template root inside `agentdeckRoot`, typically `$WSL_HOME/.agentdeck/templates`. */
  templateUserRoot: string
  /** Resolve a project id to its WSL path, or null if unknown. */
  getProjectPath(projectId: string): string | null
}

/**
 * Register the env-namespace IPC channels.
 *
 * - `env:getAgentPaths`: returns the static path footer (claudeConfigDir,
 *   codexHome, agentdeckRoot, templateUserRoot) used by AppSettings/dialogs.
 * - `env:getAgentSnapshot`: dispatches to the per-agent reader and decorates
 *   the result with EnvCtx + runtime footer fields (agentdeckRoot,
 *   templateUserRoot, wslDistro, wslHome, projectAgentdeckDir). The renderer
 *   never sees a raw `projectPath`; project ids are resolved through the
 *   injected `getProjectPath` accessor so the IPC stays the single source of
 *   truth for project-scope lookups.
 */
export function registerEnvIpc(ctx: EnvCtx): void {
  ipcMain.handle('env:getAgentPaths', async () => ({
    claudeConfigDir: ctx.claudeConfigDir,
    codexHome: ctx.codexHome,
    agentdeckRoot: ctx.agentdeckRoot,
    templateUserRoot: ctx.templateUserRoot,
  }))

  ipcMain.handle('env:getAgentSnapshot', async (_, opts: unknown): Promise<AgentEnvSnapshot> => {
    if (!opts || typeof opts !== 'object') {
      throw new Error('env:getAgentSnapshot expects an options object')
    }
    const { agentId, projectId, force } = opts as {
      agentId?: unknown
      projectId?: unknown
      force?: unknown
    }
    if (typeof agentId !== 'string' || !KNOWN_AGENT_IDS.has(agentId)) {
      throw new Error(`env:getAgentSnapshot: invalid agentId`)
    }
    let projectPath: string | undefined
    if (projectId !== undefined && projectId !== null) {
      if (typeof projectId !== 'string' || !SAFE_ID_RE.test(projectId)) {
        throw new Error('env:getAgentSnapshot: invalid projectId')
      }
      const resolved = ctx.getProjectPath(projectId)
      if (!resolved) {
        throw new Error(`env:getAgentSnapshot: unknown projectId`)
      }
      projectPath = resolved
    }
    const forceVal = force === true
    log.debug('env:getAgentSnapshot', { agentId, projectId, force: forceVal })

    const [snapshot, wslDistro, wslHome] = await Promise.all([
      getAgentSnapshot({ agentId, projectPath, force: forceVal }),
      getDefaultDistroAsync().catch(() => null),
      getWslHome().catch(() => null),
    ])
    return {
      ...snapshot,
      paths: {
        ...snapshot.paths,
        agentdeckRoot: ctx.agentdeckRoot,
        templateUserRoot: ctx.templateUserRoot,
        wslDistro,
        wslHome,
        projectAgentdeckDir: projectPath ? `${projectPath}/.agentdeck` : null,
      },
    }
  })
}
