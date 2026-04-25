import { useShallow } from 'zustand/react/shallow'
import type { Template } from '../../shared/types'
import { useAppStore } from '../store/appStore'
import { getTemplatesForActiveProject } from '../selectors/templates'

/**
 * Returns the merged, sorted list of templates applicable to the active
 * project (user pool + active project's project pool, deduped by id with
 * project winning on collision, sorted by pinned then lastUsedAt desc then
 * name asc).
 *
 * Wrapped in `useShallow` because the selector returns a fresh array on every
 * call. Without shallow equality, every store update would re-fire consumers
 * and trigger Maximum-update-depth-exceeded loops in React 19 / zustand 5.
 */
export function useTemplates(): Template[] {
  return useAppStore(useShallow((s) => getTemplatesForActiveProject(s)))
}
