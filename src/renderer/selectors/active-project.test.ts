import { describe, it, expect } from 'vitest'
import { getActiveProjectId } from './active-project'

describe('getActiveProjectId', () => {
  it('returns null when activeSessionId is null', () => {
    expect(getActiveProjectId({ activeSessionId: null, sessions: {} } as never)).toBeNull()
  })

  it('returns null when active session has no projectId', () => {
    expect(
      getActiveProjectId({
        activeSessionId: 's1',
        sessions: { s1: { id: 's1', projectId: '' } },
      } as never),
    ).toBeNull()
  })

  it("returns the active session's projectId", () => {
    expect(
      getActiveProjectId({
        activeSessionId: 's1',
        sessions: { s1: { id: 's1', projectId: 'p42' } },
      } as never),
    ).toBe('p42')
  })
})
