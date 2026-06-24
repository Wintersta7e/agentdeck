import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import WorkflowNodeEditorPanel from './WorkflowNodeEditorPanel'
import { useAppStore } from '../../store/appStore'
import type { AgentNode, WorkflowNodeStatus } from '../../../shared/types'
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

function agentNode(overrides: Partial<AgentNode> = {}): AgentNode {
  return {
    id: 'n1',
    name: 'Node One',
    x: 0,
    y: 0,
    type: 'agent',
    agent: 'claude-code',
    ...overrides,
  }
}

const noStatuses: Record<string, WorkflowNodeStatus> = {}

beforeEach(() => {
  Object.defineProperty(window, 'agentDeck', {
    value: {
      skills: { list: vi.fn(async () => []) },
      log: { send: vi.fn(async () => {}) },
    },
    writable: true,
    configurable: true,
  })
  useAppStore.setState({
    ...useAppStore.getInitialState(),
    agentRegistry: [builtinAgent, customAgent],
  } as never)
})

afterEach(() => {
  cleanup()
})

describe('WorkflowNodeEditorPanel agent dropdown', () => {
  it('lists a custom agent from the live registry as an option', () => {
    render(
      <WorkflowNodeEditorPanel
        node={agentNode()}
        nodeStatuses={noStatuses}
        onUpdateNode={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    // The custom agent's option is the registry-sourced label.
    const customOption = screen.getByRole('option', { name: 'My Bot' }) as HTMLOptionElement
    expect(customOption).toBeInTheDocument()
    const select = customOption.closest('select') as HTMLSelectElement
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toContain('Claude Code')
  })

  it('shows the best-effort hint when the selected agent is custom', () => {
    render(
      <WorkflowNodeEditorPanel
        node={agentNode({ agent: 'my-bot' })}
        nodeStatuses={noStatuses}
        onUpdateNode={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText(/best-effort/i)).toBeInTheDocument()
  })

  it('does not show the best-effort hint for a builtin agent', () => {
    render(
      <WorkflowNodeEditorPanel
        node={agentNode({ agent: 'claude-code' })}
        nodeStatuses={noStatuses}
        onUpdateNode={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByText(/best-effort/i)).not.toBeInTheDocument()
  })
})
