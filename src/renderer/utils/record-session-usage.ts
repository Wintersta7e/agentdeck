import { useAppStore } from '../store/appStore'
import { getDefaultAgent } from '../../shared/agent-helpers'

/**
 * Resolve a finished session's productivity stats from the store and report
 * them to main. Best-effort: any failure is logged and swallowed. Main dedups
 * by sessionId, so calling this from multiple end paths is safe.
 */
export function recordSessionUsage(sessionId: string): void {
  const state = useAppStore.getState()
  const session = state.sessions[sessionId]
  if (!session) return

  const project = state.projects.find((p) => p.id === session.projectId)
  const agent =
    session.agentOverride ??
    (project ? getDefaultAgent(project)?.agent : undefined) ??
    'claude-code'

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
