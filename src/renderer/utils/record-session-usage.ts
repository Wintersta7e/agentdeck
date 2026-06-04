import { useAppStore } from '../store/appStore'
import { resolveSessionAgent } from './resolve-session-agent'

/**
 * Resolve a finished session's productivity stats from the store and report
 * them to main. Best-effort: any failure is logged and swallowed. Main dedups
 * by sessionId, so calling this from multiple end paths is safe.
 */
export function recordSessionUsage(sessionId: string): void {
  const state = useAppStore.getState()
  const session = state.sessions[sessionId]
  if (!session) {
    window.agentDeck.log.send('warn', 'usage', 'recordSessionUsage: session not found', {
      sessionId,
    })
    return
  }

  const agent = resolveSessionAgent(session, state.projects)

  void window.agentDeck.usage
    .recordSession({
      sessionId,
      agent,
      projectId: session.projectId,
      startedAt: session.startedAt,
      endedAt: Date.now(),
      filesChanged: state.writeCountBySession[sessionId] ?? 0,
    })
    .catch((err: unknown) => {
      window.agentDeck.log.send('debug', 'usage', 'recordSession failed', { err: String(err) })
    })
}
