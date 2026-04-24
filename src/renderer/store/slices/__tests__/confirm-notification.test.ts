import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../../appStore'

describe('addConfirmNotification', () => {
  beforeEach(() => {
    useAppStore.setState({ notifications: [] } as never)
  })

  it('appends a notification with actions and returns a Promise that resolves on action', async () => {
    const promise = useAppStore.getState().addConfirmNotification({
      title: 'Test?',
      options: [
        { id: 'yes', label: 'Yes', tone: 'primary' },
        { id: 'no', label: 'No', tone: 'danger' },
      ],
    })

    const n = useAppStore.getState().notifications.at(-1)
    expect(n).toBeDefined()
    expect(n?.kind).toBe('confirm')
    ;(n as { resolve: (v: string) => void }).resolve('yes')

    const result = await promise
    expect(result).toBe('yes')
  })

  it('resolves with cancel when dismissed', async () => {
    const promise = useAppStore.getState().addConfirmNotification({
      title: 'Test?',
      options: [{ id: 'yes', label: 'Yes', tone: 'primary' }],
    })
    const n = useAppStore.getState().notifications.at(-1) as { resolve: (v: string) => void }
    n.resolve('cancel')
    expect(await promise).toBe('cancel')
  })
})
