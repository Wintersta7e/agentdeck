import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import type { AppStore } from '../project-store'
import { detectAgents } from '../agent-detector'
import { checkAllUpdates, updateAgent } from '../agent-updater'
import { KNOWN_AGENT_IDS } from '../../shared/agents'
import { createLogger } from '../logger'

const log = createLogger('ipc-agents')

/**
 * Agent IPC handlers: detection, visibility, version checks, updates, WSL username.
 */
export function registerAgentHandlers(
  getWindow: () => BrowserWindow | null,
  store: AppStore,
): void {
  /* ── Agent detection (async, non-blocking) ──────────────────────── */
  ipcMain.handle('agents:check', () => detectAgents(log))

  /* ── Agent visibility ─────────────────────────────────────────── */
  ipcMain.handle('agents:getVisible', () => {
    return store.get('appPrefs').visibleAgents ?? null
  })
  ipcMain.handle('agents:setVisible', (_, agents: string[]) => {
    if (!Array.isArray(agents)) return store.get('appPrefs').visibleAgents ?? null
    const safe = agents.filter((a) => typeof a === 'string' && KNOWN_AGENT_IDS.has(a))
    store.set('appPrefs', { ...store.get('appPrefs'), visibleAgents: safe })
    return safe
  })

  /* -- Agent version checks (fire-and-forget) ---------------------- */
  ipcMain.handle('agents:checkUpdates', (_, installedAgents: unknown) => {
    if (!installedAgents || typeof installedAgents !== 'object' || Array.isArray(installedAgents))
      return
    const win = getWindow()
    if (win) checkAllUpdates(win, installedAgents as Record<string, boolean>)
  })

  ipcMain.handle('agents:update', async (_, agentId: string) => {
    if (!KNOWN_AGENT_IDS.has(agentId)) {
      return { agentId, success: false, newVersion: null, message: 'Unknown agent' }
    }
    return updateAgent(agentId)
  })

  /* ── WSL username ─────────────────────────────────────────────── */
  ipcMain.handle('app:wslUsername', async () => {
    const { execFile } = await import('child_process')
    const tryCmd = (args: string[]): Promise<string> =>
      new Promise((resolve) => {
        execFile('wsl.exe', args, { timeout: 10000 }, (err, stdout) => {
          const out = stdout?.trim() ?? ''
          if (err || !out) {
            resolve('')
            return
          }
          resolve(out)
        })
      })

    // Race all approaches in parallel — first non-empty result wins.
    // On cold WSL boot, sequential attempts can stall for 45s total.
    const results = await Promise.all([
      tryCmd(['--', 'bash', '-lc', 'whoami']),
      tryCmd(['--', 'whoami']),
      tryCmd(['--', 'bash', '-lc', 'echo $USER']),
    ])
    const result = results.find((r) => r !== '') ?? ''
    if (!result) log.warn('Failed to detect WSL username')
    return result
  })
}
