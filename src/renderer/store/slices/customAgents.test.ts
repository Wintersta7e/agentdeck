import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from '../appStore'
import { AGENTS } from '../../../shared/agents'
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
let onParseError: ReturnType<typeof vi.fn>
let unsubscribe: ReturnType<typeof vi.fn>
let parseErrorUnsubscribe: ReturnType<typeof vi.fn>
let registryChangeCb: (() => void) | null
let parseErrorCb: ((e: { warnings: string[] }) => void) | null

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  registryChangeCb = null
  parseErrorCb = null
  unsubscribe = vi.fn()
  parseErrorUnsubscribe = vi.fn()
  getRegistry = vi.fn(async () => [makeDescriptor()])
  onRegistryChange = vi.fn((cb: () => void) => {
    registryChangeCb = cb
    return unsubscribe
  })
  onParseError = vi.fn((cb: (e: { warnings: string[] }) => void) => {
    parseErrorCb = cb
    return parseErrorUnsubscribe
  })
  ;(globalThis as unknown as { window: Window }).window.agentDeck = {
    agents: { getRegistry, onRegistryChange, onParseError },
    log: { send: vi.fn() },
  } as never
})

describe('customAgents slice', () => {
  it('setAgentRegistry replaces the registry', () => {
    const next = [makeDescriptor({ id: 'codex', name: 'Codex' })]
    useAppStore.getState().setAgentRegistry(next)
    expect(useAppStore.getState().agentRegistry).toBe(next)
  })

  it('seeds the registry with built-in descriptors before bootstrap', () => {
    const seeded = useAppStore.getState().agentRegistry
    // Defaults to all built-ins so selectAgentMeta resolves them pre-hydration.
    expect(seeded).toHaveLength(AGENTS.length)
    expect(seeded.every((d) => d.source === 'builtin')).toBe(true)
    expect(seeded.map((d) => d.id)).toEqual(AGENTS.map((a) => a.id))
  })

  it('bootstrapAgentRegistry populates agentRegistry from getRegistry', async () => {
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

  it('is idempotent: re-bootstrapping tears down the previous subscriptions', async () => {
    await useAppStore.getState().bootstrapAgentRegistry()
    await useAppStore.getState().bootstrapAgentRegistry()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(parseErrorUnsubscribe).toHaveBeenCalledTimes(1)
    expect(onRegistryChange).toHaveBeenCalledTimes(2)
    expect(onParseError).toHaveBeenCalledTimes(2)
  })

  it('routes agents.toml parse warnings to addNotification (one per warning)', async () => {
    await useAppStore.getState().bootstrapAgentRegistry()
    expect(onParseError).toHaveBeenCalledTimes(1)
    expect(parseErrorCb).toBeTypeOf('function')

    parseErrorCb?.({
      warnings: [
        'skipped invalid agent — bad binary',
        'duplicate agent id "x" — keeping the first',
      ],
    })

    const notes = useAppStore.getState().notifications.filter((n) => n.kind === 'basic')
    expect(notes).toHaveLength(2)
    expect(notes.every((n) => n.kind === 'basic' && n.type === 'warning')).toBe(true)
    expect(notes[0]?.kind === 'basic' && notes[0].message).toContain('Custom agent skipped')
    expect(notes[0]?.kind === 'basic' && notes[0].message).toContain('bad binary')
  })

  it('logs and keeps the built-in default when getRegistry rejects', async () => {
    getRegistry.mockRejectedValueOnce(new Error('boom'))
    await useAppStore.getState().bootstrapAgentRegistry()
    // Failed initial pull leaves the built-in seed intact (not wiped to []).
    const after = useAppStore.getState().agentRegistry
    expect(after).toHaveLength(AGENTS.length)
    expect(after.every((d) => d.source === 'builtin')).toBe(true)
    // Subscription is still established after a failed initial pull.
    expect(onRegistryChange).toHaveBeenCalledTimes(1)
  })
})
