import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../store/appStore'
import { promptDirtyWorktree } from './prompt-dirty-worktree'

describe('promptDirtyWorktree', () => {
  beforeEach(() => {
    useAppStore.setState({ notifications: [] } as never)
  })

  it('offers [Keep-branch / Discard all / Cancel] when hasChanges && hasUnmerged', async () => {
    const p = promptDirtyWorktree({ branch: 'feat/x', hasChanges: true, hasUnmerged: true })
    const n = useAppStore.getState().notifications.at(-1) as {
      options: { id: string }[]
      resolve: (v: string) => void
    }
    expect(n.options.map((o) => o.id).sort()).toEqual(['cancel', 'discard', 'keep'])
    n.resolve('keep')
    expect(await p).toBe('keep')
  })

  it('omits Keep when hasChanges && !hasUnmerged', async () => {
    const p = promptDirtyWorktree({ branch: 'feat/x', hasChanges: true, hasUnmerged: false })
    const n = useAppStore.getState().notifications.at(-1) as {
      options: { id: string }[]
      resolve: (v: string) => void
    }
    expect(n.options.map((o) => o.id).sort()).toEqual(['cancel', 'discard'])
    n.resolve('discard')
    expect(await p).toBe('discard')
  })
})
