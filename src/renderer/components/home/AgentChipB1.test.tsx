import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AgentChipB1 } from './AgentChipB1'
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
  contextWindow: 64_000,
  source: 'user',
}

describe('AgentChipB1', () => {
  afterEach(() => cleanup())
  beforeEach(() => {
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      agentRegistry: [...useAppStore.getInitialState().agentRegistry, customAgent],
    } as never)
    // useEffectiveContext fires an IPC on mount; never resolve so the chip keeps
    // its registry context window (deterministic render).
    Object.defineProperty(window, 'agentDeck', {
      value: { agents: { getEffectiveContext: vi.fn(() => new Promise(() => {})) } },
      writable: true,
      configurable: true,
    })
  })

  it('renders a custom agent (not an empty fragment) with name, short, icon, ctx', () => {
    const { container } = render(<AgentChipB1 agentId={'my-bot' as never} />)
    // Used to early-return <></> when the builtin lookup missed — now must render.
    expect(container.querySelector('.agent-chip-b1')).toBeInTheDocument()
    expect(screen.getByText('My Custom Bot')).toBeInTheDocument()
    expect(screen.getByText('MB')).toBeInTheDocument()
    expect(container.querySelector('.agent-chip-b1__glyph')?.textContent).toBe('★')
    // contextWindow comes from the registry descriptor (64k).
    expect(container.querySelector('.agent-chip-b1__ctx')?.textContent).toMatch(/64k/)
    // Custom-agent colour resolves to its picked var.
    const article = container.querySelector('.agent-chip-b1') as HTMLElement
    expect(article.style.getPropertyValue('--chip-color')).toBe('var(--green)')
  })

  it('renders a built-in agent via the registry default', () => {
    const { container } = render(<AgentChipB1 agentId={'claude-code' as never} />)
    expect(container.querySelector('.agent-chip-b1')).toBeInTheDocument()
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })
})
