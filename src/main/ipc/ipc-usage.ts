import { ipcMain } from 'electron'
import { CH } from '../../shared/ipc-channels'
import { SAFE_ID_RE, MAX_SAFE_ID_LEN } from '../validation'
import { KNOWN_AGENT_IDS } from '../../shared/agents'
import type { UsageHistory } from '../usage-history'
import type { SessionUsageRecord } from '../../shared/types'

function parseRecord(raw: unknown): SessionUsageRecord {
  if (!raw || typeof raw !== 'object') throw new Error('usage:recordSession requires an object')
  const r = raw as Record<string, unknown>
  if (typeof r.sessionId !== 'string' || !SAFE_ID_RE.test(r.sessionId))
    throw new Error('usage:recordSession requires a valid sessionId')
  if (typeof r.agent !== 'string' || !KNOWN_AGENT_IDS.has(r.agent))
    throw new Error('usage:recordSession requires a known agent')
  if (
    typeof r.projectId !== 'string' ||
    !r.projectId ||
    r.projectId.length > MAX_SAFE_ID_LEN ||
    !SAFE_ID_RE.test(r.projectId)
  )
    throw new Error('usage:recordSession requires a valid projectId')
  if (typeof r.startedAt !== 'number' || !Number.isFinite(r.startedAt))
    throw new Error('usage:recordSession requires numeric startedAt')
  if (typeof r.endedAt !== 'number' || !Number.isFinite(r.endedAt))
    throw new Error('usage:recordSession requires numeric endedAt')
  if (typeof r.filesChanged !== 'number' || !Number.isFinite(r.filesChanged))
    throw new Error('usage:recordSession requires numeric filesChanged')
  return {
    sessionId: r.sessionId,
    agent: r.agent,
    projectId: r.projectId,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    filesChanged: r.filesChanged,
  }
}

export function registerUsageHandlers(usageHistory: UsageHistory): void {
  // Dedup: both the PTY exit handler and explicit session-close may fire.
  const recorded = new Set<string>()

  ipcMain.handle(CH.usageRecordSession, (_, raw: unknown) => {
    const rec = parseRecord(raw)
    if (recorded.has(rec.sessionId)) return
    if (recorded.size > 500) recorded.clear()
    recorded.add(rec.sessionId)
    usageHistory.recordSession(rec)
  })

  ipcMain.handle(CH.usageGetHistory, (_, days: number) => {
    if (typeof days !== 'number' || days < 1 || days > 365)
      throw new Error('Invalid days parameter')
    return usageHistory.getHistory(days)
  })
}
