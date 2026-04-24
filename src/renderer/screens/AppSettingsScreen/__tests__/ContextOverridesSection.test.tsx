import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ContextOverridesSection } from '../ContextOverridesSection'
import { AGENTS } from '../../../../shared/agents'

const setOverride = vi.fn().mockResolvedValue({ ok: true })

beforeEach(() => {
  setOverride.mockClear()
  ;(globalThis as unknown as { window: Window }).window.agentDeck = {
    agents: {
      getOverrides: vi.fn().mockResolvedValue({ agent: {}, model: {} }),
      getEffectiveContext: vi.fn().mockResolvedValue({
        value: 200_000,
        source: 'default',
        modelId: null,
      }),
      setContextOverride: setOverride,
    },
  } as never
})

afterEach(() => {
  cleanup()
})

describe('ContextOverridesSection', () => {
  it('renders a row per agent', async () => {
    render(<ContextOverridesSection />)
    await waitFor(() => expect(screen.queryByText(AGENTS[0]!.name)).not.toBeNull())
    for (const a of AGENTS) {
      expect(screen.queryByText(a.name)).not.toBeNull()
    }
  })

  it('submits a valid per-agent override', async () => {
    render(<ContextOverridesSection />)
    const first = AGENTS[0]!
    await waitFor(() => expect(screen.queryByLabelText(`${first.name} override`)).not.toBeNull())
    const input = screen.getByLabelText(`${first.name} override`) as HTMLInputElement
    fireEvent.change(input, { target: { value: '500000' } })
    fireEvent.blur(input)
    await waitFor(() =>
      expect(setOverride).toHaveBeenCalledWith({
        kind: 'agent',
        agentId: first.id,
        value: 500_000,
      }),
    )
  })

  it('rejects out-of-range client-side', async () => {
    render(<ContextOverridesSection />)
    const first = AGENTS[0]!
    await waitFor(() => expect(screen.queryByLabelText(`${first.name} override`)).not.toBeNull())
    const input = screen.getByLabelText(`${first.name} override`) as HTMLInputElement
    fireEvent.change(input, { target: { value: '500' } })
    fireEvent.blur(input)
    await new Promise((r) => setTimeout(r, 50))
    expect(setOverride).not.toHaveBeenCalled()
  })

  it('Clear button wipes override with value: undefined', async () => {
    const first = AGENTS[0]!
    // Seed an existing override so the Clear button is enabled.
    ;(globalThis as unknown as { window: Window }).window.agentDeck.agents.getOverrides = vi
      .fn()
      .mockResolvedValue({ agent: { [first.id]: 500_000 }, model: {} })
    render(<ContextOverridesSection />)
    // Wait for the override to load and the button to become enabled.
    await waitFor(() => {
      const btn = screen.queryByLabelText(
        `Clear ${first.name} override`,
      ) as HTMLButtonElement | null
      expect(btn).not.toBeNull()
      expect(btn!.disabled).toBe(false)
    })
    const clear = screen.getByLabelText(`Clear ${first.name} override`) as HTMLButtonElement
    fireEvent.click(clear)
    await waitFor(() =>
      expect(setOverride).toHaveBeenCalledWith({
        kind: 'agent',
        agentId: first.id,
        value: undefined,
      }),
    )
  })

  it('shows error message for out-of-range input', async () => {
    render(<ContextOverridesSection />)
    const first = AGENTS[0]!
    await waitFor(() => expect(screen.queryByLabelText(`${first.name} override`)).not.toBeNull())
    const input = screen.getByLabelText(`${first.name} override`) as HTMLInputElement
    fireEvent.change(input, { target: { value: '500' } })
    fireEvent.blur(input)
    await waitFor(() => expect(screen.queryByText(/Must be an integer between/i)).not.toBeNull())
  })

  it('does not call setContextOverride for blank + no existing override (noop)', async () => {
    render(<ContextOverridesSection />)
    const first = AGENTS[0]!
    await waitFor(() => expect(screen.queryByLabelText(`${first.name} override`)).not.toBeNull())
    const input = screen.getByLabelText(`${first.name} override`) as HTMLInputElement
    fireEvent.blur(input) // draft is '' and agentOverride is undefined
    await new Promise((r) => setTimeout(r, 50))
    expect(setOverride).not.toHaveBeenCalled()
  })
})
