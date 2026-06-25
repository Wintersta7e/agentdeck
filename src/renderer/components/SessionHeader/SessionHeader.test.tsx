import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SessionHeader } from './SessionHeader'
import { useAppStore } from '../../store/appStore'
import type { AgentDescriptorWire } from '../../../shared/custom-agents'

const customAgent: AgentDescriptorWire = {
  id: 'my-bot',
  binary: 'mybot',
  name: 'My Custom Bot',
  icon: '★',
  short: 'MB',
  colorVar: '--green',
  description: 'A user-defined console agent',
  contextWindow: 0,
  source: 'user',
}

describe('SessionHeader', () => {
  afterEach(() => cleanup())
  beforeEach(() => {
    useAppStore.setState({
      ...useAppStore.getInitialState(),
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

  it('renders a custom agent with its registry name + icon (not the raw id)', () => {
    useAppStore.setState({
      agentRegistry: [...useAppStore.getState().agentRegistry, customAgent],
      sessions: {
        s1: {
          id: 's1',
          projectId: 'p1',
          status: 'running',
          startedAt: 0,
          approvalState: 'idle',
          seedTemplateId: null,
          agentOverride: 'my-bot',
        },
      },
    } as never)
    const { container } = render(<SessionHeader />)
    expect(screen.getByText('My Custom Bot')).toBeInTheDocument()
    // Raw id must NOT leak into the agent label.
    expect(screen.queryByText('my-bot')).not.toBeInTheDocument()
    expect(container.querySelector('.session-header__glyph')?.textContent).toBe('★')
    // Custom-agent colour resolves to its picked var, not the neutral --accent.
    const header = container.querySelector('.session-header') as HTMLElement
    expect(header.style.getPropertyValue('--agent-accent')).toBe('var(--green)')
  })

  it('flags a dangling (deleted) custom agent as no longer registered', () => {
    // Session points at an id absent from the registry (deleted custom agent).
    useAppStore.setState({
      sessions: {
        s1: {
          id: 's1',
          projectId: 'p1',
          status: 'running',
          startedAt: 0,
          approvalState: 'idle',
          seedTemplateId: null,
          agentOverride: 'ghost-agent',
        },
      },
    } as never)
    const { container } = render(<SessionHeader />)
    const agentLabel = container.querySelector('.session-header__agent') as HTMLElement
    expect(agentLabel.getAttribute('title')).toBe('Agent no longer registered')
    expect(container.querySelector('.session-header__unregistered')).toBeInTheDocument()
  })
})
