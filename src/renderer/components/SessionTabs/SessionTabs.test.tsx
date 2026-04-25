import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionTabs } from './SessionTabs'
import { useAppStore } from '../../store/appStore'

vi.mock('../../utils/session-close', () => ({ closeSession: vi.fn(async () => {}) }))

describe('SessionTabs', () => {
  beforeEach(() => {
    useAppStore.setState({
      sessions: {
        s1: {
          id: 's1',
          projectId: 'p1',
          status: 'running',
          startedAt: 0,
          approvalState: 'idle',
          seedTemplateId: null,
        },
        s2: {
          id: 's2',
          projectId: 'p2',
          status: 'exited',
          startedAt: 0,
          approvalState: 'review',
          seedTemplateId: null,
        },
      },
      openSessionIds: ['s1', 's2'],
      activeSessionId: 's1',
      projects: [
        { id: 'p1', name: 'proj1', path: '/p1' },
        { id: 'p2', name: 'proj2', path: '/p2' },
      ],
    } as never)
  })

  it('renders one tab per openSessionIds', () => {
    render(<SessionTabs />)
    expect(screen.getAllByRole('tab')).toHaveLength(2)
  })

  it('shows {N} OPEN counter', () => {
    const { container } = render(<SessionTabs />)
    const counter = container.querySelector('.session-tabs__counter')
    expect(counter?.textContent).toMatch(/2 OPEN/)
  })

  it('click tab -> setActiveSession', () => {
    const setActive = vi.fn()
    useAppStore.setState({ setActiveSession: setActive } as never)
    render(<SessionTabs />)
    const tabs = screen.getAllByRole('tab')
    const second = tabs[1]
    if (!second) throw new Error('expected 2 tabs')
    fireEvent.click(second)
    expect(setActive).toHaveBeenCalledWith('s2')
  })

  it('click close -> closeSession orchestrator', async () => {
    const { closeSession } = await import('../../utils/session-close')
    render(<SessionTabs />)
    const closes = screen.getAllByLabelText(/close session/i)
    const first = closes[0]
    if (!first) throw new Error('expected close button')
    fireEvent.click(first)
    expect(closeSession).toHaveBeenCalledWith('s1')
  })
})
