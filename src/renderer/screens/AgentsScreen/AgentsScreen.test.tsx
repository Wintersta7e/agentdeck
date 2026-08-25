import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { useAppStore } from '../../store/appStore'
import { AGENTS } from '../../../shared/agents'
import { AgentsScreen } from './AgentsScreen'

let update: ReturnType<typeof vi.fn>

function installedExcept(missingId: string): Record<string, boolean> {
  return Object.fromEntries(AGENTS.map((a) => [a.id, a.id !== missingId]))
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  update = vi.fn(async () => ({ success: true, newVersion: '0.145.0' }))
  ;(window as unknown as { agentDeck: unknown }).agentDeck = {
    agents: {
      update,
      saveCustom: vi.fn(),
      deleteCustom: vi.fn(),
      getCustomSpec: vi.fn(),
      getEffectiveContext: vi.fn(async () => ({ value: null, source: 'default' })),
    },
    store: { saveProject: vi.fn() },
    log: { send: vi.fn() },
  }
})

afterEach(() => {
  cleanup()
})

describe('AgentsScreen', () => {
  it('offers Install for an agent whose binary is missing', async () => {
    // Regression: an update can leave an agent unlinked (npm resolves the
    // platform-specific optional dep badly and skips the bin symlink). The
    // tile then read "Not installed" with its action button disabled, so the
    // app that broke the binary offered no way to put it back.
    useAppStore.setState({ agentStatus: installedExcept('codex') })
    render(<AgentsScreen />)

    // findBy* so the effective-context effect settles inside act().
    const install = await screen.findByRole('button', { name: 'Install' })
    expect(install).toBeEnabled()

    fireEvent.click(install)
    // waitFor so the update promise's state writes settle inside act().
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith('codex')
    })
  })

  it('leaves an up-to-date agent without an action', async () => {
    useAppStore.setState({ agentStatus: installedExcept('') })
    render(<AgentsScreen />)

    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()
    for (const button of await screen.findAllByRole('button', { name: 'Up to date' })) {
      expect(button).toBeDisabled()
    }
  })
})
