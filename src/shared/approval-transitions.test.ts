import { describe, it, expect } from 'vitest'
import { nextApprovalState } from './approval-transitions'
import type { ApprovalState } from './types'

const ALL_STATUSES = ['starting', 'running', 'error', 'exited'] as const
const ALL_APPROVALS: ApprovalState[] = ['idle', 'review', 'kept', 'discarded']

describe('nextApprovalState — pure transition matrix', () => {
  it('running -> exited with idle -> review (the one auto transition)', () => {
    expect(
      nextApprovalState({ status: 'running', approvalState: 'idle' }, { status: 'exited' }),
    ).toBe('review')
  })

  it('starting -> exited keeps approvalState (spawn failures route through status=error separately)', () => {
    expect(
      nextApprovalState({ status: 'starting', approvalState: 'idle' }, { status: 'exited' }),
    ).toBe('idle')
  })

  it('running -> exited with already-review stays review', () => {
    expect(
      nextApprovalState({ status: 'running', approvalState: 'review' }, { status: 'exited' }),
    ).toBe('review')
  })

  it('running -> exited with kept stays kept', () => {
    expect(
      nextApprovalState({ status: 'running', approvalState: 'kept' }, { status: 'exited' }),
    ).toBe('kept')
  })

  it('identity for every non-running->exited case', () => {
    for (const prevStatus of ALL_STATUSES) {
      for (const prevApproval of ALL_APPROVALS) {
        for (const nextStatus of ALL_STATUSES) {
          const shouldFlip =
            prevStatus === 'running' && nextStatus === 'exited' && prevApproval === 'idle'
          const actual = nextApprovalState(
            { status: prevStatus, approvalState: prevApproval },
            { status: nextStatus },
          )
          const expected = shouldFlip ? 'review' : prevApproval
          expect(actual, `${prevStatus}+${prevApproval} -> ${nextStatus}`).toBe(expected)
        }
      }
    }
  })
})
