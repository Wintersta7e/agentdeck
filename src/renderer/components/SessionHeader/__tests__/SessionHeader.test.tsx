import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SessionHeader } from '../SessionHeader'
import { useAppStore } from '../../../store/appStore'

describe('SessionHeader', () => {
  afterEach(() => cleanup())
  beforeEach(() => {
    useAppStore.setState({
      sessions: {
        s1: {
          id: 's1',
          projectId: 'p1',
          status: 'exited',
          startedAt: 0,
          approvalState: 'review',
          seedTemplateId: null,
        },
      },
      activeSessionId: 's1',
      projects: [{ id: 'p1', name: 'proj1', path: '/p1' }],
      gitStatuses: {},
    } as never)
  })

  it('shows KEEP + DISCARD for exited+review', () => {
    render(<SessionHeader />)
    expect(screen.getByText(/KEEP/)).toBeInTheDocument()
    expect(screen.getByText(/DISCARD/)).toBeInTheDocument()
  })

  it('clicking KEEP calls setApprovalState("kept")', () => {
    const spy = vi.fn()
    useAppStore.setState({ setApprovalState: spy } as never)
    render(<SessionHeader />)
    fireEvent.click(screen.getByText(/KEEP/))
    expect(spy).toHaveBeenCalledWith('s1', 'kept')
  })

  it('clicking DISCARD calls setApprovalState("discarded")', () => {
    const spy = vi.fn()
    useAppStore.setState({ setApprovalState: spy } as never)
    render(<SessionHeader />)
    fireEvent.click(screen.getByText(/DISCARD/))
    expect(spy).toHaveBeenCalledWith('s1', 'discarded')
  })
})
