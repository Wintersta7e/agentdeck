import { ipcMain } from 'electron'

export interface EnvCtx {
  /** Value of `$CLAUDE_CONFIG_DIR` at process start, or null if unset. */
  claudeConfigDir: string | null
  /** Value of `$CODEX_HOME` at process start, or null if unset. */
  codexHome: string | null
  /** The AgentDeck user-scope root, typically `$WSL_HOME/.agentdeck`. */
  agentdeckRoot: string
  /** Template root inside `agentdeckRoot`, typically `$WSL_HOME/.agentdeck/templates`. */
  templateUserRoot: string
}

/**
 * Register the `env:getAgentPaths` IPC channel. Exposed to the renderer so it
 * can show where templates and agent configs live (AppSettings, dialogs).
 *
 * PREREQ H9: spec requires `agentdeckRoot` + `templateUserRoot` as separate
 * fields. `agentdeckRoot` is the parent and `templateUserRoot` is the
 * templates subdir beneath it.
 */
export function registerEnvIpc(ctx: EnvCtx): void {
  ipcMain.handle('env:getAgentPaths', async () => ({
    claudeConfigDir: ctx.claudeConfigDir,
    codexHome: ctx.codexHome,
    agentdeckRoot: ctx.agentdeckRoot,
    templateUserRoot: ctx.templateUserRoot,
  }))
}
