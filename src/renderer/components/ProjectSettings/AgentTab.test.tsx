import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { AgentTab } from './AgentTab'
import { useAppStore } from '../../store/appStore'
import type { Project } from '../../../shared/types'
import type { AgentDescriptorWire } from '../../../shared/custom-agents'

const builtinAgent: AgentDescriptorWire = {
  id: 'claude-code',
  binary: 'claude',
  name: 'Claude Code',
  icon: '⬡',
  short: 'CC',
  colorVar: '--accent',
  description: 'Anthropic AI coding agent',
  contextWindow: 200_000,
  source: 'builtin',
}

const customAgent: AgentDescriptorWire = {
  id: 'my-bot',
  binary: 'mybot',
  name: 'My Bot',
  icon: '★',
  short: 'MB',
  colorVar: '--green',
  description: 'A user-defined console agent',
  contextWindow: 0,
  source: 'user',
}

function draft(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Project One',
    path: '/repo/one',
    agents: [{ agent: 'claude-code', isDefault: true }],
    ...overrides,
  }
}

beforeEach(() => {
  useAppStore.setState({
    ...useAppStore.getInitialState(),
    agentRegistry: [builtinAgent, customAgent],
  } as never)
})

afterEach(() => {
  cleanup()
})

describe('AgentTab', () => {
  it('lists a custom agent from the live registry as an option', () => {
    render(<AgentTab draft={draft()} onChange={vi.fn()} />)

    expect(screen.getByText('My Bot')).toBeInTheDocument()
    expect(screen.getByText('A user-defined console agent')).toBeInTheDocument()
  })

  it('toggling a custom agent adds it to the project agents', () => {
    const onChange = vi.fn()
    render(<AgentTab draft={draft()} onChange={onChange} />)

    fireEvent.click(screen.getByText('My Bot'))

    expect(onChange).toHaveBeenCalledWith({
      agents: [{ agent: 'claude-code', isDefault: true }, { agent: 'my-bot' }],
    })
  })
})
