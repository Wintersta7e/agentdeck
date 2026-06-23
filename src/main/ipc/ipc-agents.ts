import { CH } from '../../shared/ipc-channels'
import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import type { AppStore } from '../project-store'
import type { AgentRegistry } from '../agent-registry'
import { detectAgents } from '../agent-detector'
import { checkAllUpdates, updateAgent } from '../agent-updater'
import { AGENTS, KNOWN_AGENT_IDS, isBuiltinAgent } from '../../shared/agents'
import { getEffectiveContextWindow } from '../../shared/context-window'
import { resolveActiveModel, invalidateAll as invalidateModelCache } from '../active-model-cache'
import { isValidContextOverride } from '../validation'
import { createLogger } from '../logger'
import { resolveWslUsername } from '../wsl-utils'

const log = createLogger('ipc-agents')

/** Per-agent default context windows, keyed by agent id. Hoisted so the three
 *  effective-context handlers share one computation. */
const AGENT_CONTEXT_DEFAULTS = Object.fromEntries(AGENTS.map((a) => [a.id, a.contextWindow]))

/** Agent IPC handlers: detection, visibility, version checks, updates, WSL username, context resolution, custom-agent registry. */
export function registerAgentHandlers(
  getWindow: () => BrowserWindow | null,
  store: AppStore,
  registry: AgentRegistry,
): void {
  /* ── Agent detection (async, non-blocking) ──────────────────────── */
  ipcMain.handle(CH.agentsCheck, () => {
    invalidateModelCache()
    return detectAgents(log)
  })

  /* ── Custom-agent registry (live singleton) ─────────────────────── */
  ipcMain.handle(CH.agentsGetRegistry, () => registry.all())

  ipcMain.handle(CH.agentsSaveCustom, async (_, spec: unknown) => {
    const res = await registry.saveCustom(spec)
    if (res.ok) getWindow()?.webContents.send(CH.agentsRegistryChange)
    return res
  })

  ipcMain.handle(CH.agentsDeleteCustom, async (_, id: unknown) => {
    const safeId = typeof id === 'string' ? id : ''
    const ok = await registry.deleteCustom(safeId)
    if (ok) getWindow()?.webContents.send(CH.agentsRegistryChange)
    return ok
  })

  /* ── Agent visibility ─────────────────────────────────────────── */
  ipcMain.handle(CH.agentsGetVisible, () => {
    return store.get('appPrefs').visibleAgents ?? null
  })
  ipcMain.handle(CH.agentsSetVisible, (_, agents: string[]) => {
    if (!Array.isArray(agents)) return store.get('appPrefs').visibleAgents ?? null
    const safe = agents.filter((a) => typeof a === 'string' && KNOWN_AGENT_IDS.has(a))
    store.set('appPrefs', { ...store.get('appPrefs'), visibleAgents: safe })
    return safe
  })

  /* -- Agent version checks (fire-and-forget) ---------------------- */
  ipcMain.handle(CH.agentsCheckUpdates, (_, installedAgents: unknown) => {
    if (!installedAgents || typeof installedAgents !== 'object' || Array.isArray(installedAgents))
      return
    // Keep only boolean values — the cast alone wouldn't reject a non-boolean.
    const checked: Record<string, boolean> = {}
    for (const [id, v] of Object.entries(installedAgents)) {
      if (typeof v === 'boolean') checked[id] = v
    }
    const win = getWindow()
    if (win) checkAllUpdates(win, checked)
  })

  ipcMain.handle(CH.agentsUpdate, async (_, agentId: string) => {
    if (!KNOWN_AGENT_IDS.has(agentId)) {
      return { agentId, success: false, newVersion: null, message: 'Unknown agent' }
    }
    return updateAgent(agentId)
  })

  /* ── Effective context (auto-detect) ───────────────────────────── */
  ipcMain.handle(CH.agentsGetEffectiveContext, async (_, agentId: unknown) => {
    if (typeof agentId !== 'string' || !isBuiltinAgent(agentId)) {
      return { error: 'invalid agentId' }
    }
    const detector = await resolveActiveModel(agentId)
    const prefs = store.get('appPrefs')
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
      agentDefaults: AGENT_CONTEXT_DEFAULTS,
    })
  })

  /* ── Effective context for launch snapshot (force-refresh + frozen prefs) ── */
  ipcMain.handle(CH.agentsGetEffectiveContextForLaunch, async (_, agentId: unknown) => {
    if (typeof agentId !== 'string' || !isBuiltinAgent(agentId)) {
      return { error: 'invalid agentId' }
    }
    // Freeze appPrefs BEFORE the detector I/O so a save during the read can't leak in.
    const prefs = store.get('appPrefs')
    const agentOverrides = prefs.agentContextOverrides ?? {}
    const modelOverrides = prefs.modelContextOverrides ?? {}
    const detector = await resolveActiveModel(agentId, { forceRefresh: true })
    return getEffectiveContextWindow({
      agentId,
      activeModel: detector.modelId,
      ...(detector.cliContextOverride !== undefined
        ? { cliContextOverride: detector.cliContextOverride }
        : {}),
      overrides: { agent: agentOverrides, model: modelOverrides },
      agentDefaults: AGENT_CONTEXT_DEFAULTS,
    })
  })

  /* ── Effective context for an explicit model (fallback-only) ────── */
  ipcMain.handle(
    CH.agentsGetEffectiveContextForModel,
    async (_, agentId: unknown, modelId: unknown) => {
      if (typeof agentId !== 'string' || !KNOWN_AGENT_IDS.has(agentId)) {
        return { error: 'invalid agentId' }
      }
      if (typeof modelId !== 'string' || modelId.length === 0) {
        return { error: 'invalid modelId' }
      }
      const prefs = store.get('appPrefs')
      return getEffectiveContextWindow({
        agentId,
        activeModel: modelId,
        overrides: {
          agent: prefs.agentContextOverrides ?? {},
          model: prefs.modelContextOverrides ?? {},
        },
        agentDefaults: AGENT_CONTEXT_DEFAULTS,
      })
    },
  )

  /* ── Set / clear a context override ────────────────────────────── */
  ipcMain.handle(CH.agentsSetContextOverride, (_, args: unknown) => {
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
  ipcMain.handle(CH.agentsGetOverrides, () => {
    const prefs = store.get('appPrefs')
    return {
      agent: prefs.agentContextOverrides ?? {},
      model: prefs.modelContextOverrides ?? {},
    }
  })

  /* ── WSL username ─────────────────────────────────────────────── */
  ipcMain.handle(CH.appWslUsername, () => resolveWslUsername())
}
