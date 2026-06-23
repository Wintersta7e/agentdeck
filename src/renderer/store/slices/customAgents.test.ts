import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from '../appStore'
import type { AgentDescriptorWire } from '../../../shared/custom-agents'

function makeDescriptor(over: Partial<AgentDescriptorWire> = {}): AgentDescriptorWire {
  return {
    id: 'claude-code',
    binary: 'claude',
    name: 'Claude Code',
    icon: '✦',
    short: 'CC',
    colorVar: '--agent-claude',
    description: 'Claude Code CLI',
    contextWindow: 200_000,
    source: 'builtin',
    ...over,
  }
}

let getRegistry: ReturnType<typeof vi.fn>
let onRegistryChange: ReturnType<typeof vi.fn>
let unsubscribe: ReturnType<typeof vi.fn>
let registryChangeCb: (() => void) | null

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  registryChangeCb = null
  unsubscribe = vi.fn()
  getRegistry = vi.fn(async () => [makeDescriptor()])
  onRegistryChange = vi.fn((cb: () => void) => {
    registryChangeCb = cb
    return unsubscribe
  })
  ;(globalThis as unknown as { window: Window }).window.agentDeck = {
    agents: { getRegistry, onRegistryChange },
    log: { send: vi.fn() },
  } as never
})

describe('customAgents slice', () => {
  it('setAgentRegistry replaces the registry', () => {
    const next = [makeDescriptor({ id: 'codex', name: 'Codex' })]
    useAppStore.getState().setAgentRegistry(next)
    expect(useAppStore.getState().agentRegistry).toBe(next)
  })

  it('bootstrapAgentRegistry populates agentRegistry from getRegistry', async () => {
    expect(useAppStore.getState().agentRegistry).toEqual([])
    await useAppStore.getState().bootstrapAgentRegistry()
    expect(getRegistry).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().agentRegistry).toEqual([makeDescriptor()])
  })

  it('subscribes via onRegistryChange and re-pulls when the callback fires', async () => {
    await useAppStore.getState().bootstrapAgentRegistry()
    expect(onRegistryChange).toHaveBeenCalledTimes(1)
    expect(registryChangeCb).toBeTypeOf('function')

    // Registry changes on disk → next pull returns a different list.
    const updated = [makeDescriptor(), makeDescriptor({ id: 'my-tool', source: 'user' })]
    getRegistry.mockResolvedValueOnce(updated)
    registryChangeCb?.()
    // Let the re-pull promise settle.
    await Promise.resolve()
    await Promise.resolve()
    expect(getRegistry).toHaveBeenCalledTimes(2)
    expect(useAppStore.getState().agentRegistry).toEqual(updated)
  })

  it('is idempotent: re-bootstrapping tears down the previous subscription', async () => {
    await useAppStore.getState().bootstrapAgentRegistry()
    await useAppStore.getState().bootstrapAgentRegistry()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(onRegistryChange).toHaveBeenCalledTimes(2)
  })

  it('logs and leaves the registry empty when getRegistry rejects', async () => {
    getRegistry.mockRejectedValueOnce(new Error('boom'))
    await useAppStore.getState().bootstrapAgentRegistry()
    expect(useAppStore.getState().agentRegistry).toEqual([])
    // Subscription is still established after a failed initial pull.
    expect(onRegistryChange).toHaveBeenCalledTimes(1)
  })
})
