import { useMemo } from 'react'
import type { Role } from '../../shared/types'
import { useAppStore } from '../store/appStore'

/**
 * Shared hook that returns a memoized Map<roleId, Role>.
 * Avoids duplicate Map construction across WorkflowNode instances
 * and WorkflowNodeEditorPanel.
 */
export function useRolesMap(): Map<string, Role> {
  const roles = useAppStore((s) => s.roles)
  return useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])
}
