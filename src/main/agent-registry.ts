/**
 * Runtime agent registry: the 7 built-ins merged with user agents loaded from
 * `<userData>/agents.toml`. Single source of truth in the main process for
 * "what agents exist", consumed by spawn, the workflow runner, the id-gates, and
 * (via IPC) the renderer. Constructed with an explicit file path (no Electron
 * dependency) so it is unit-testable.
 */
import { readFileSync } from 'node:fs'
import { parse as parseToml } from 'smol-toml'
import { AGENTS, AGENT_BINARY_MAP } from '../shared/agents'
import { validateCustomAgent, type CustomAgentSpec } from '../shared/custom-agents'

/** Redacted, renderer-safe view of an agent. NEVER carries args/env (main-only). */
export interface AgentDescriptorWire {
  id: string
  binary: string
  name: string
  icon: string
  short: string
  colorVar: string
  description: string
  contextWindow: number
  source: 'builtin' | 'user'
}

const BUILTIN_IDS: ReadonlySet<string> = new Set(AGENTS.map((a) => a.id))

function builtinDescriptors(): AgentDescriptorWire[] {
  return AGENTS.map((a) => ({
    id: a.id,
    binary: a.binary,
    name: a.name,
    icon: a.icon,
    short: a.short,
    colorVar: a.colorVar,
    description: a.description,
    contextWindow: a.contextWindow,
    source: 'builtin' as const,
  }))
}

function customDescriptor(spec: CustomAgentSpec): AgentDescriptorWire {
  return {
    id: spec.id,
    binary: spec.binary,
    name: spec.ui.name,
    icon: spec.ui.icon ?? '●',
    short: spec.ui.short ?? spec.ui.name.slice(0, 2).toUpperCase(),
    colorVar: spec.ui.colorVar ?? '--accent',
    description: spec.ui.description ?? '',
    contextWindow: spec.ui.contextWindow ?? 0,
    source: 'user' as const,
  }
}

export class AgentRegistry {
  private readonly filePath: string
  private custom = new Map<string, CustomAgentSpec>()
  private descriptors: AgentDescriptorWire[] = builtinDescriptors()
  private ids: Set<string> = new Set(BUILTIN_IDS)

  constructor(filePath: string) {
    this.filePath = filePath
  }

  /** Read + validate + merge agents.toml. Missing file is fine; bad entries are
   *  skipped with a warning so one typo can't disable all custom agents. */
  load(): { warnings: string[] } {
    const warnings: string[] = []
    this.custom = new Map()

    let text: string
    try {
      text = readFileSync(this.filePath, 'utf8')
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      if (err.code !== 'ENOENT') warnings.push(`agents.toml: ${err.message}`)
      this.rebuild()
      return { warnings }
    }

    let parsed: unknown
    try {
      parsed = parseToml(text)
    } catch (e) {
      warnings.push(`agents.toml parse error: ${(e as Error).message}`)
      this.rebuild()
      return { warnings }
    }

    const arr = (parsed as Record<string, unknown>)['agent']
    if (Array.isArray(arr)) {
      for (const raw of arr) {
        const res = validateCustomAgent(raw, BUILTIN_IDS)
        if (!res.ok) {
          warnings.push(`agents.toml: skipped invalid agent — ${res.error}`)
          continue
        }
        if (this.custom.has(res.value.id)) {
          warnings.push(`agents.toml: duplicate agent id "${res.value.id}" — keeping the first`)
          continue
        }
        this.custom.set(res.value.id, res.value)
      }
    }

    this.rebuild()
    return { warnings }
  }

  private rebuild(): void {
    const customDescs = [...this.custom.values()].map(customDescriptor)
    this.descriptors = [...builtinDescriptors(), ...customDescs]
    this.ids = new Set([...BUILTIN_IDS, ...this.custom.keys()])
  }

  all(): readonly AgentDescriptorWire[] {
    return this.descriptors
  }

  byId(id: string): AgentDescriptorWire | undefined {
    return this.descriptors.find((d) => d.id === id)
  }

  has(id: string): boolean {
    return this.ids.has(id)
  }

  isCustom(id: string): boolean {
    return this.custom.has(id)
  }

  knownIds(): ReadonlySet<string> {
    return this.ids
  }

  /** Binary to launch; undefined for an unknown id. */
  binaryFor(id: string): string | undefined {
    const c = this.custom.get(id)
    if (c) return c.binary
    return AGENT_BINARY_MAP[id]
  }

  /** Default launch args (custom only); [] for builtins/unknown. */
  argsFor(id: string): string[] {
    return this.custom.get(id)?.args ?? []
  }

  /** Non-secret env (custom only); {} for builtins/unknown. */
  envFor(id: string): Record<string, string> {
    return this.custom.get(id)?.env ?? {}
  }

  /** Last-resort context window: custom ui value, builtin default, else 0. */
  contextWindowFor(id: string): number {
    const c = this.custom.get(id)
    if (c) return c.ui.contextWindow ?? 0
    return AGENTS.find((a) => a.id === id)?.contextWindow ?? 0
  }
}
