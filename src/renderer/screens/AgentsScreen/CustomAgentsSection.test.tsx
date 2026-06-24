import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { useAppStore } from '../../store/appStore'
import type { AgentDescriptorWire } from '../../../shared/custom-agents'
import type { Project } from '../../../shared/types'
import { CustomAgentsSection } from './CustomAgentsSection'

function descriptor(over: Partial<AgentDescriptorWire> = {}): AgentDescriptorWire {
  return {
    id: 'my-agent',
    binary: 'my-agent-bin',
    name: 'My Agent',
    icon: '✦',
    short: 'HM',
    colorVar: '--accent',
    description: 'Local autonomous agent',
    contextWindow: 128000,
    source: 'user',
    ...over,
  }
}

const builtin = descriptor({ id: 'claude-code', name: 'Claude Code', source: 'builtin' })

let saveCustom: ReturnType<typeof vi.fn>
let deleteCustom: ReturnType<typeof vi.fn>
let getCustomSpec: ReturnType<typeof vi.fn>

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  saveCustom = vi.fn(async () => ({ ok: true as const, warnings: [] }))
  deleteCustom = vi.fn(async () => true)
  getCustomSpec = vi.fn(async () => null)
  ;(window as unknown as { agentDeck: unknown }).agentDeck = {
    agents: { saveCustom, deleteCustom, getCustomSpec },
    log: { send: vi.fn() },
  }
})

afterEach(() => {
  cleanup()
})

describe('CustomAgentsSection', () => {
  it('lists custom agents from the registry (and not built-ins)', () => {
    useAppStore.setState({ agentRegistry: [builtin, descriptor()] })
    render(<CustomAgentsSection />)
    expect(screen.getByText('My Agent')).toBeInTheDocument()
    expect(screen.getByText('my-agent-bin')).toBeInTheDocument()
    expect(screen.queryByText('Claude Code')).not.toBeInTheDocument()
  })

  it('shows an empty-state hint when there are no custom agents', () => {
    useAppStore.setState({ agentRegistry: [builtin] })
    render(<CustomAgentsSection />)
    expect(screen.getByText(/No custom agents yet/i)).toBeInTheDocument()
  })

  it('"Add agent" opens the modal', () => {
    useAppStore.setState({ agentRegistry: [] })
    render(<CustomAgentsSection />)
    fireEvent.click(screen.getByRole('button', { name: /Add agent/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Add agent', { selector: 'h2' })).toBeInTheDocument()
  })

  it('Save is disabled for an invalid (empty) form', () => {
    useAppStore.setState({ agentRegistry: [] })
    render(<CustomAgentsSection />)
    fireEvent.click(screen.getByRole('button', { name: /Add agent/i }))
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
  })

  it('Save calls saveCustom with a valid spec', async () => {
    useAppStore.setState({ agentRegistry: [] })
    render(<CustomAgentsSection />)
    fireEvent.click(screen.getByRole('button', { name: /Add agent/i }))

    fireEvent.change(screen.getByPlaceholderText('My Agent'), { target: { value: 'My Tool' } })
    fireEvent.change(screen.getByPlaceholderText('my-agent-bin'), { target: { value: 'mytool' } })

    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).not.toBeDisabled()
    fireEvent.click(save)

    await waitFor(() => expect(saveCustom).toHaveBeenCalledTimes(1))
    const spec = saveCustom.mock.calls[0]?.[0] as {
      id: string
      binary: string
      ui: { name: string }
    }
    expect(spec.id).toBe('my-tool')
    expect(spec.binary).toBe('mytool')
    expect(spec.ui.name).toBe('My Tool')
  })

  it('edit mode locks the id (read-only)', () => {
    useAppStore.setState({ agentRegistry: [descriptor()] })
    render(<CustomAgentsSection />)
    fireEvent.click(screen.getByRole('button', { name: /Edit My Agent/i }))
    const idInput = screen.getByDisplayValue('my-agent')
    expect(idInput).toHaveAttribute('readonly')
  })

  it('a credential-shaped env key shows the warning', () => {
    useAppStore.setState({ agentRegistry: [] })
    render(<CustomAgentsSection />)
    fireEvent.click(screen.getByRole('button', { name: /Add agent/i }))

    // open Advanced
    fireEvent.click(screen.getByRole('button', { name: /Advanced/i }))
    fireEvent.click(screen.getByRole('button', { name: /Add variable/i }))
    fireEvent.change(screen.getByLabelText('Env key 1'), { target: { value: 'API_TOKEN' } })

    expect(screen.getByText(/looks like a credential/i)).toBeInTheDocument()
  })

  it('delete routes through the confirm and calls deleteCustom', async () => {
    useAppStore.setState({ agentRegistry: [descriptor()] })
    render(<CustomAgentsSection />)
    fireEvent.click(screen.getByRole('button', { name: /Delete My Agent/i }))

    // ConfirmDialog appears
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText(/Remove My Agent\?/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(deleteCustom).toHaveBeenCalledWith('my-agent'))
  })

  it('delete confirm shows the project reference count when in use', () => {
    const projects: Project[] = [
      {
        id: 'p1',
        name: 'P1',
        path: '/home/u/p1',
        agents: [{ agent: 'my-agent', isDefault: true }],
      },
    ] as Project[]
    useAppStore.setState({ agentRegistry: [descriptor()], projects })
    render(<CustomAgentsSection />)
    fireEvent.click(screen.getByRole('button', { name: /Delete My Agent/i }))
    expect(screen.getByText(/in use by 1 project/i)).toBeInTheDocument()
  })

  it('clone opens the modal pre-filled with a blank id', () => {
    useAppStore.setState({ agentRegistry: [descriptor()] })
    render(<CustomAgentsSection />)
    fireEvent.click(screen.getByRole('button', { name: /Clone My Agent/i }))
    expect(screen.getByText('Clone agent', { selector: 'h2' })).toBeInTheDocument()
    // name carried over with " copy"; id derived fresh (not the source id)
    expect(screen.getByDisplayValue('My Agent copy')).toBeInTheDocument()
  })
})
