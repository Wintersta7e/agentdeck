import type { AppState } from '../store/appStore'

export function getActiveProjectId(
  state: Pick<AppState, 'activeSessionId' | 'sessions'>,
): string | null {
  const id = state.activeSessionId
  if (!id) return null
  const session = state.sessions[id]
  return session?.projectId || null
}
