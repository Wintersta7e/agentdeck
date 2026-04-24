import type { ApprovalState, SessionStatus } from './types'

/**
 * Only fires ONE automatic transition: running -> exited with idle approval.
 * 'starting -> exited' is treated as a spawn failure upstream (status gets
 * normalized to 'error'); it never triggers review.
 * Error / user-kill / other transitions leave approvalState alone.
 */
export function nextApprovalState(
  prev: { status: SessionStatus; approvalState: ApprovalState },
  next: { status: SessionStatus },
): ApprovalState {
  if (prev.status === 'running' && next.status === 'exited' && prev.approvalState === 'idle') {
    return 'review'
  }
  return prev.approvalState
}
