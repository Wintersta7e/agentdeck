import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import type { AppStore } from '../project-store'
import { detectAgents } from '../agent-detector'
import { checkAllUpdates, updateAgent } from '../agent-updater'
import { AGENTS, KNOWN_AGENT_IDS } from '../../shared/agents'
import { getEffectiveContextWindow } from '../../shared/context-window'
import { resolveActiveModel, invalidateAll as invalidateModelCache } from '../active-model-cache'
import { isValidContextOverride } from '../validation'
import { createLogger } from '../logger'
import type { AgentType } from '../../shared/types'

const log = createLogger('ipc-agents')

/** Agent IPC handlers: detection, visibility, version checks, updates, WSL username, context resolution. */
export function registerAgentHandlers(
  getWindow: () => BrowserWindow | null,
  store: AppStore,
): void {
  /* ── Agent detection (async, non-blocking) ──────────────────────── */
  ipcMain.handle('agents:check', () => {
    invalidateModelCache()
    return detectAgents(log)
  })

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

  /* ── Effective context (auto-detect) ───────────────────────────── */
  ipcMain.handle('agents:getEffectiveContext', async (_, agentId: unknown) => {
    if (typeof agentId !== 'string' || !KNOWN_AGENT_IDS.has(agentId)) {
      return { error: 'invalid agentId' }
    }
    const detector = await resolveActiveModel(agentId as AgentType)
    const prefs = store.get('appPrefs')
    const defaults = Object.fromEntries(AGENTS.map((a) => [a.id, a.contextWindow]))
    return getEffectiveContextWindow({
      agentId,
      activeModel: detector.modelId,
      ...(detector.cliContextOverride !== undefined
        ? { cliContextOverride: detector.cliContextOverride }
        : {}),
      overrides: {
        agent: prefs.agentContextOverrides ?? {},
        model: prefs.modelContextOverrides ?? {},
      },
      agentDefaults: defaults,
    })
  })

  /* ── Effective context for an explicit model (fallback-only) ────── */
  ipcMain.handle(
    'agents:getEffectiveContextForModel',
    async (_, agentId: unknown, modelId: unknown) => {
      if (typeof agentId !== 'string' || !KNOWN_AGENT_IDS.has(agentId)) {
        return { error: 'invalid agentId' }
      }
      if (typeof modelId !== 'string' || modelId.length === 0) {
        return { error: 'invalid modelId' }
      }
      const prefs = store.get('appPrefs')
      const defaults = Object.fromEntries(AGENTS.map((a) => [a.id, a.contextWindow]))
      return getEffectiveContextWindow({
        agentId,
        activeModel: modelId,
        overrides: {
          agent: prefs.agentContextOverrides ?? {},
          model: prefs.modelContextOverrides ?? {},
        },
        agentDefaults: defaults,
      })
    },
  )

  /* ── Set / clear a context override ────────────────────────────── */
  ipcMain.handle('agents:setContextOverride', (_, args: unknown) => {
    if (!args || typeof args !== 'object') return { ok: false, error: 'invalid payload' }
    const { kind, value } = args as { kind?: string; value?: unknown }
    if (kind !== 'agent' && kind !== 'model') return { ok: false, error: 'invalid kind' }
    if (value !== undefined && !isValidContextOverride(value)) {
      return { ok: false, error: 'value must be an integer in [1000, 10000000] or undefined' }
    }
    const prefs = store.get('appPrefs')
    if (kind === 'agent') {
      const { agentId } = args as { agentId?: unknown }
      if (typeof agentId !== 'string' || !KNOWN_AGENT_IDS.has(agentId)) {
        return { ok: false, error: 'invalid agentId' }
      }
      const prev = prefs.agentContextOverrides ?? {}
      const map =
        value === undefined
          ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== agentId))
          : { ...prev, [agentId]: value as number }
      store.set('appPrefs', { ...prefs, agentContextOverrides: map })
      return { ok: true }
    }
    const { modelId } = args as { modelId?: unknown }
    if (typeof modelId !== 'string' || modelId.length === 0) {
      return { ok: false, error: 'invalid modelId' }
    }
    const prev = prefs.modelContextOverrides ?? {}
    const map =
      value === undefined
        ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== modelId))
        : { ...prev, [modelId]: value as number }
    store.set('appPrefs', { ...prefs, modelContextOverrides: map })
    return { ok: true }
  })

  /* ── Read both override maps ────────────────────────────────────── */
  ipcMain.handle('agents:getOverrides', () => {
    const prefs = store.get('appPrefs')
    return {
      agent: prefs.agentContextOverrides ?? {},
      model: prefs.modelContextOverrides ?? {},
    }
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
