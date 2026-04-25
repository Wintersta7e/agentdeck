import type { AppState } from '../store/appStore'
import type { Template } from '../../shared/types'
import { getActiveProjectId } from './active-project'

/**
 * Selector that merges user-scope templates with the active project's
 * project-scope templates, deduped by id (project wins on collision) and
 * sorted by (pinned desc, lastUsedAt desc, name asc).
 *
 * Use via the {@link useTemplates} hook or directly against store state for
 * non-React call sites.
 */
export function getTemplatesForActiveProject(
  state: Pick<AppState, 'userTemplates' | 'projectTemplates' | 'activeSessionId' | 'sessions'>,
): Template[] {
  const activeProjectId = getActiveProjectId(state)
  const projectPool = activeProjectId ? (state.projectTemplates[activeProjectId] ?? []) : []
  const byId = new Map<string, Template>()
  for (const t of state.userTemplates) byId.set(t.id, t)
  for (const t of projectPool) byId.set(t.id, t) // project wins
  return Array.from(byId.values()).sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (a.lastUsedAt !== b.lastUsedAt) return b.lastUsedAt - a.lastUsedAt
    return a.name.localeCompare(b.name)
  })
}
