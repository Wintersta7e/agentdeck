import { describe, it, expect } from 'vitest'
import { getActionButtons } from './session-actions'
import type { Session } from '../../shared/types'

const makeSession = (overrides: Partial<Session>): Session =>
  ({
    id: 's1',
    projectId: 'p1',
    status: 'running',
    startedAt: 0,
    approvalState: 'idle',
    seedTemplateId: null,
    ...overrides,
  }) as Session

describe('getActionButtons', () => {
  it('exited + review -> KEEP + DISCARD', () => {
    expect(
      getActionButtons(makeSession({ status: 'exited', approvalState: 'review' })).map((b) => b.id),
    ).toEqual(['keep', 'discard'])
  })
  it('exited + kept -> RERUN', () => {
    expect(
      getActionButtons(makeSession({ status: 'exited', approvalState: 'kept' })).map((b) => b.id),
    ).toEqual(['rerun'])
  })
  it('exited + discarded -> RERUN', () => {
    expect(
      getActionButtons(makeSession({ status: 'exited', approvalState: 'discarded' })).map(
        (b) => b.id,
      ),
    ).toEqual(['rerun'])
  })
  it('running + idle -> none', () => {
    expect(getActionButtons(makeSession({ status: 'running', approvalState: 'idle' }))).toEqual([])
  })
  it('starting + idle -> none', () => {
    expect(getActionButtons(makeSession({ status: 'starting', approvalState: 'idle' }))).toEqual([])
  })
  it('error + idle -> none', () => {
    expect(getActionButtons(makeSession({ status: 'error', approvalState: 'idle' }))).toEqual([])
  })
  it('exited + idle -> none (transient orphan)', () => {
    expect(getActionButtons(makeSession({ status: 'exited', approvalState: 'idle' }))).toEqual([])
  })
  it('running + kept -> none (orphan guard)', () => {
    expect(getActionButtons(makeSession({ status: 'running', approvalState: 'kept' }))).toEqual([])
  })
})
