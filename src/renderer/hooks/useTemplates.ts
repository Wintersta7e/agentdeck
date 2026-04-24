import type { Template } from '../../shared/types'
import { useAppStore } from '../store/appStore'
import { getTemplatesForActiveProject } from '../selectors/templates'

/**
 * Returns the merged, sorted list of templates applicable to the active
 * project (user pool + active project's project pool, deduped by id with
 * project winning on collision, sorted by pinned then lastUsedAt desc then
 * name asc).
 *
 * Each render produces a fresh array reference. Wrap in `useShallow` if this
 * becomes a re-render hotspot.
 */
export function useTemplates(): Template[] {
  return useAppStore((s) => getTemplatesForActiveProject(s))
}
