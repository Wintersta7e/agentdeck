import { useCallback, useMemo, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { resolveSessionAgent } from '../utils/resolve-session-agent'
import { USAGE_REFRESH_INTERVAL_MS } from '../../shared/constants'
import { usePollEffect } from './usePollEffect'
import type { SessionRecord, Session, Project } from '../../shared/types'

export interface SessionRow {
  sessionId: string
  projectId: string
  agent: string
  startedAt: number
  endedAt: number | null
  status: 'exited' | 'error'
  filesChanged: number
}

/**
 * Persisted records are authoritative (accurate endedAt/filesChanged, incl. past
 * runs). Live store sessions only FILL THE GAP for brand-new sessions not yet in
 * the polled records (running, endedAt null). Records win on sessionId conflict.
 */
export function mergeSessionRows(
  records: SessionRecord[],
  liveSessions: Record<string, Session>,
  writeCounts: Record<string, number>,
  projects: Project[],
): SessionRow[] {
  const byId = new Map<string, SessionRow>()
  for (const r of records) byId.set(r.sessionId, { ...r })
  for (const s of Object.values(liveSessions)) {
    if (byId.has(s.id)) continue // record is authoritative
    byId.set(s.id, {
      sessionId: s.id,
      projectId: s.projectId,
      agent: resolveSessionAgent(s, projects),
      startedAt: s.startedAt,
      endedAt: null, // brand-new live session = running
      status: 'exited',
      filesChanged: writeCounts[s.id] ?? 0,
    })
  }
  return Array.from(byId.values()).sort((a, b) => a.startedAt - b.startedAt)
}

export function useSessionHistory(days: number): SessionRow[] {
  const [records, setRecords] = useState<SessionRecord[]>([])
  const liveSessions = useAppStore((s) => s.sessions)
  const writeCounts = useAppStore((s) => s.writeCountBySession)
  const projects = useAppStore((s) => s.projects)
  const load = useCallback(
    async (isActive: () => boolean) => {
      try {
        const next = await window.agentDeck.sessions.getHistory(days)
        if (isActive()) setRecords(next)
      } catch {
        /* best-effort */
      }
    },
    [days],
  )
  usePollEffect(load, USAGE_REFRESH_INTERVAL_MS)
  return useMemo(
    () => mergeSessionRows(records, liveSessions, writeCounts, projects),
    [records, liveSessions, writeCounts, projects],
  )
}
