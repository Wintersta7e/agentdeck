import type { Session } from '../../shared/types'

export interface ActionButton {
  id: 'keep' | 'discard' | 'rerun'
  label: string
  tone: 'success' | 'danger' | 'primary'
}

/**
 * Returns the action buttons to show for a session, based on its
 * (SessionStatus x ApprovalState) matrix. Empty array means no buttons.
 *
 * Matrix (per spec section 4.3):
 * - exited + review    -> KEEP, DISCARD
 * - exited + kept      -> RERUN
 * - exited + discarded -> RERUN
 * - everything else    -> none
 */
export function getActionButtons(session: Session): ActionButton[] {
  if (session.status !== 'exited') return []
  if (session.approvalState === 'review') {
    return [
      { id: 'keep', label: '✓ KEEP', tone: 'success' },
      { id: 'discard', label: '✗ DISCARD', tone: 'danger' },
    ]
  }
  if (session.approvalState === 'kept' || session.approvalState === 'discarded') {
    return [{ id: 'rerun', label: '↻ RERUN', tone: 'primary' }]
  }
  return []
}
