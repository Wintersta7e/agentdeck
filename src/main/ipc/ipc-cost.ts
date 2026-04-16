import { ipcMain } from 'electron'
import { SAFE_ID_RE } from '../validation'
import { KNOWN_AGENT_IDS } from '../../shared/agents'
import type { CostTracker } from '../cost-tracker'
import type { CostHistory } from '../cost-history'

/**
 * Cost IPC handlers: bind/unbind session cost tracking.
 */
export function registerCostHandlers(
  getCostTracker: () => CostTracker | null,
  costHistory: CostHistory,
): void {
  ipcMain.handle('cost:getHistory', (_, days: number) => {
    if (typeof days !== 'number' || days < 1 || days > 365) {
      throw new Error('Invalid days parameter')
    }
    return costHistory.getHistory(days)
  })

  ipcMain.handle('cost:getBudget', () => {
    return costHistory.getBudget()
  })

  ipcMain.handle('cost:setBudget', (_, amount: number | null) => {
    if (amount !== null && (typeof amount !== 'number' || amount < 0)) {
      throw new Error('Invalid budget amount')
    }
    costHistory.setBudget(amount)
  })

  ipcMain.handle(
    'cost:bind',
    (
      _,
      sessionId: string,
      opts: { agent: string; projectPath: string; cwd: string; spawnAt: number },
    ) => {
      if (typeof sessionId !== 'string' || !SAFE_ID_RE.test(sessionId)) {
        throw new Error('cost:bind requires a valid sessionId')
      }
      if (!opts || typeof opts !== 'object') {
        throw new Error('cost:bind requires an opts object')
      }
      if (typeof opts.agent !== 'string' || !KNOWN_AGENT_IDS.has(opts.agent)) {
        throw new Error('cost:bind requires a known agent')
      }
      if (typeof opts.cwd !== 'string' || !opts.cwd) {
        throw new Error('cost:bind requires a non-empty cwd')
      }
      if (typeof opts.spawnAt !== 'number' || !Number.isFinite(opts.spawnAt)) {
        throw new Error('cost:bind requires a finite numeric spawnAt')
      }
      if (opts.projectPath !== undefined && typeof opts.projectPath !== 'string') {
        throw new Error('cost:bind requires a string projectPath')
      }
      getCostTracker()?.bindSession(sessionId, opts)
    },
  )

  ipcMain.handle('cost:unbind', (_, sessionId: string) => {
    if (typeof sessionId !== 'string' || !SAFE_ID_RE.test(sessionId)) {
      throw new Error('cost:unbind requires a valid sessionId')
    }
    getCostTracker()?.unbindSession(sessionId)
  })
}
