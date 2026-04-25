import { useAppStore } from '../store/appStore'

export type DirtyChoice = 'keep' | 'discard' | 'cancel'

export async function promptDirtyWorktree(input: {
  branch?: string
  hasChanges: boolean
  hasUnmerged: boolean
}): Promise<DirtyChoice> {
  const branchTag = input.branch ? ` on ${input.branch}` : ''
  const title = input.hasUnmerged
    ? `Close session${branchTag}? Uncommitted changes will be lost.`
    : `Close session${branchTag}? The branch has no commits to save.`

  const options: { id: DirtyChoice; label: string; tone?: 'primary' | 'danger' | 'neutral' }[] = []
  if (input.hasUnmerged) {
    options.push({ id: 'keep', label: 'Keep branch', tone: 'primary' })
  }
  options.push({ id: 'discard', label: 'Discard', tone: 'danger' })
  options.push({ id: 'cancel', label: 'Cancel', tone: 'neutral' })

  const result = await useAppStore.getState().addConfirmNotification({ title, options })
  return (result as DirtyChoice) || 'cancel'
}
