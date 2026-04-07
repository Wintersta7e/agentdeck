import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../../appStore'

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
})

describe('home slice', () => {
  it('sets git status for a project', () => {
    const status = {
      branch: 'main',
      ahead: 0,
      behind: 0,
      staged: 1,
      unstaged: 2,
      untracked: 0,
      insertions: 42,
      deletions: 10,
    }
    useAppStore.getState().setGitStatus('proj-1', status)
    expect(useAppStore.getState().gitStatuses['proj-1']).toEqual(status)
  })

  it('sets git status to null for non-git projects', () => {
    useAppStore.getState().setGitStatus('proj-2', null)
    expect(useAppStore.getState().gitStatuses['proj-2']).toBeNull()
  })

  it('manages review items', () => {
    const items = [
      {
        id: 'r1',
        sessionId: 's1',
        agentId: 'claude-code',
        projectId: 'proj-1',
        timestamp: Date.now(),
        files: [{ path: 'src/auth.ts', insertions: 42, deletions: 3, status: 'added' as const }],
        totalInsertions: 42,
        totalDeletions: 3,
        status: 'pending' as const,
      },
    ]
    useAppStore.getState().setReviewItems(items)
    expect(useAppStore.getState().reviewItems).toHaveLength(1)
    useAppStore.getState().dismissReview('r1')
    expect(useAppStore.getState().reviewItems[0]?.status).toBe('dismissed')
  })

  it('manages cost history', () => {
    const entries = [
      {
        date: '2026-04-07',
        totalCostUsd: 4.82,
        perAgent: { 'claude-code': 3.2 },
        sessionCount: 14,
        tokenCount: 142000,
      },
    ]
    useAppStore.getState().setCostHistory(entries)
    expect(useAppStore.getState().costHistory).toHaveLength(1)
  })

  it('manages daily budget', () => {
    expect(useAppStore.getState().dailyBudget).toBeNull()
    useAppStore.getState().setDailyBudget(12.5)
    expect(useAppStore.getState().dailyBudget).toBe(12.5)
    useAppStore.getState().setDailyBudget(null)
    expect(useAppStore.getState().dailyBudget).toBeNull()
  })

  it('manages tier 3 collapse state', () => {
    expect(useAppStore.getState().tier3Collapsed).toEqual({})
    useAppStore.getState().setTier3Collapsed('timeline', true)
    expect(useAppStore.getState().tier3Collapsed['timeline']).toBe(true)
    useAppStore.getState().setTier3Collapsed('timeline', false)
    expect(useAppStore.getState().tier3Collapsed['timeline']).toBe(false)
  })
})
