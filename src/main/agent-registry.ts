/**
 * Runtime agent registry: the 7 built-ins merged with user agents loaded from
 * `<userData>/agents.toml`. Single source of truth in the main process for
 * "what agents exist", consumed by spawn, the workflow runner, the id-gates, and
 * (via IPC) the renderer. Constructed with an explicit file path (no Electron
 * dependency) so it is unit-testable.
 */
import { readFileSync } from 'node:fs'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import { AGENTS, AGENT_BINARY_MAP } from '../shared/agents'
import {
  validateCustomAgent,
  toBuiltinDescriptor,
  type AgentDescriptorWire,
  type CustomAgentSpec,
} from '../shared/custom-agents'
import { atomicWrite } from './fs-atomic'

export type { AgentDescriptorWire }

/**
 * Encrypt/decrypt for custom-agent secret env values. Injected so the registry
 * stays Electron-free and unit-testable; production backs it with `safeStorage`.
 * `encrypt` returns base64 of the ciphertext; `decrypt` reverses it (throwing on
 * failure). `available` is false when the OS keychain can't be used.
 */
export interface SecretCrypto {
  available: boolean
  encrypt(plain: string): string
  decrypt(stored: string): string
}

const BUILTIN_IDS: ReadonlySet<string> = new Set(AGENTS.map((a) => a.id))

function builtinDescriptors(): AgentDescriptorWire[] {
  return AGENTS.map(toBuiltinDescriptor)
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

/** Plain object for TOML serialization — only defined fields, no `source`. */
function toTomlEntry(spec: CustomAgentSpec): Record<string, unknown> {
  const ui: Record<string, unknown> = { name: spec.ui.name }
  if (spec.ui.icon !== undefined) ui['icon'] = spec.ui.icon
  if (spec.ui.short !== undefined) ui['short'] = spec.ui.short
  if (spec.ui.colorVar !== undefined) ui['colorVar'] = spec.ui.colorVar
  if (spec.ui.description !== undefined) ui['description'] = spec.ui.description
  if (spec.ui.contextWindow !== undefined) ui['contextWindow'] = spec.ui.contextWindow
  if (spec.ui.versionArgs !== undefined) ui['versionArgs'] = spec.ui.versionArgs

  const entry: Record<string, unknown> = { id: spec.id, binary: spec.binary }
  if (spec.args !== undefined) entry['args'] = spec.args
  if (spec.env !== undefined) entry['env'] = spec.env
  // secretEnv values are already encrypted by the caller (writeFile).
  if (spec.secretEnv !== undefined) entry['secretEnv'] = spec.secretEnv
  entry['ui'] = ui
  return entry
}

/**
 * Merge an incoming secretEnv with the prior stored one. The renderer never
 * receives decrypted secret values, so an unchanged secret round-trips as '' —
 * a blank incoming value therefore means "keep the existing secret". A blank
 * value with no prior is dropped. Returns undefined when nothing remains.
 */
function mergeSecretEnv(
  incoming: Record<string, string> | undefined,
  prior: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!incoming) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(incoming)) {
    if (v === '') {
      if (prior && prior[k] !== undefined) out[k] = prior[k]
    } else {
      out[k] = v
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export class AgentRegistry {
  private readonly filePath: string
  private readonly crypto: SecretCrypto | null
  private custom = new Map<string, CustomAgentSpec>()
  private descriptors: AgentDescriptorWire[] = builtinDescriptors()
  private ids: Set<string> = new Set(BUILTIN_IDS)
  /** Serializes write mutations so overlapping save/delete calls each start
   *  from committed in-memory state (no snapshot-before-await race). */
  private writeChain: Promise<unknown> = Promise.resolve()

  constructor(filePath: string, crypto?: SecretCrypto) {
    this.filePath = filePath
    this.crypto = crypto ?? null
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
        // Decrypt secret env to plaintext before validation (which sees plaintext).
        const decrypted = this.decryptRawSecrets(raw, warnings)
        const res = validateCustomAgent(decrypted, BUILTIN_IDS)
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

  /** Validate + upsert a custom agent, persist atomically, then reload. */
  async saveCustom(
    spec: unknown,
  ): Promise<{ ok: true; warnings: string[] } | { ok: false; error: string }> {
    const res = validateCustomAgent(spec, BUILTIN_IDS)
    if (!res.ok) return { ok: false, error: res.error }
    return this.serialize(async () => {
      // A blank incoming secret means "keep the existing one" (renderer never sees
      // decrypted values). Resolve against the prior stored spec.
      const prior = this.custom.get(res.value.id)
      const mergedSecret = mergeSecretEnv(res.value.secretEnv, prior?.secretEnv)
      if (mergedSecret && !this.crypto?.available) {
        return {
          ok: false as const,
          error: 'secure storage unavailable — cannot save secret env vars',
        }
      }
      const finalSpec: CustomAgentSpec = { ...res.value }
      if (mergedSecret !== undefined) finalSpec.secretEnv = mergedSecret
      else delete finalSpec.secretEnv

      const next = new Map(this.custom)
      next.set(finalSpec.id, finalSpec)
      await this.writeFile([...next.values()])
      return { ok: true as const, warnings: this.load().warnings }
    })
  }

  /** Remove a custom agent, persist atomically, then reload. Returns false if absent. */
  async deleteCustom(id: string): Promise<boolean> {
    return this.serialize(async () => {
      if (!this.custom.has(id)) return false
      const next = new Map(this.custom)
      next.delete(id)
      await this.writeFile([...next.values()])
      this.load()
      return true
    })
  }

  private async writeFile(specs: CustomAgentSpec[]): Promise<void> {
    const entries = specs.map((s) => this.encryptSpecSecrets(s)).map(toTomlEntry)
    await atomicWrite(this.filePath, stringifyToml({ agent: entries }))
  }

  /** Return a copy of `spec` with its secretEnv values encrypted for storage. */
  private encryptSpecSecrets(spec: CustomAgentSpec): CustomAgentSpec {
    if (!spec.secretEnv || Object.keys(spec.secretEnv).length === 0) return spec
    if (!this.crypto?.available) {
      // Guarded by saveCustom; defensive so a plaintext secret is never written.
      throw new Error('secure storage unavailable — refusing to write secret env')
    }
    const enc: Record<string, string> = {}
    for (const [k, v] of Object.entries(spec.secretEnv)) enc[k] = this.crypto.encrypt(v)
    return { ...spec, secretEnv: enc }
  }

  /** Decrypt a raw TOML entry's secretEnv to plaintext (or drop it, with a warning). */
  private decryptRawSecrets(raw: unknown, warnings: string[]): unknown {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
    const r = raw as Record<string, unknown>
    const se = r['secretEnv']
    if (!se || typeof se !== 'object' || Array.isArray(se)) return raw
    if (!this.crypto?.available) {
      // Known low-risk limitation: on Linux/macOS a transient keychain outage drops
      // secrets here, and a later registry write would not re-persist them. On the
      // Windows/DPAPI target `safeStorage` is always available, so this is effectively
      // unreachable in practice — hence no extra clobber-prevention machinery.
      warnings.push('agents.toml: secret env present but secure storage is unavailable — dropped')
      const rest: Record<string, unknown> = { ...r }
      delete rest['secretEnv']
      return rest
    }
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(se as Record<string, unknown>)) {
      if (typeof v !== 'string') continue
      try {
        out[k] = this.crypto.decrypt(v)
      } catch {
        warnings.push(`agents.toml: could not decrypt secret "${k}" — dropped`)
      }
    }
    return { ...r, secretEnv: out }
  }

  /** Run a read-modify-write-reload mutation only after any in-flight one has
   *  settled, so each starts from committed state. The chain survives a rejected
   *  link (next mutation still runs). */
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.writeChain.then(fn, fn)
    this.writeChain = result.catch(() => undefined)
    return result
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

  /**
   * Full custom spec for non-lossy edit/clone in the renderer; undefined for
   * builtins and unknown ids. Returns non-secret env, but secret VALUES are
   * REDACTED to '' — the renderer learns which secret keys exist without ever
   * receiving plaintext secrets (an unchanged secret round-trips as '' on save).
   */
  getSpec(id: string): CustomAgentSpec | undefined {
    const c = this.custom.get(id)
    if (!c) return undefined
    if (!c.secretEnv) return c
    const redacted: Record<string, string> = {}
    for (const k of Object.keys(c.secretEnv)) redacted[k] = ''
    return { ...c, secretEnv: redacted }
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

  /** Decrypted secret env (custom only, main-internal); {} for builtins/unknown. */
  secretEnvFor(id: string): Record<string, string> {
    return this.custom.get(id)?.secretEnv ?? {}
  }

  /** Last-resort context window: custom ui value, builtin default, else 0. */
  contextWindowFor(id: string): number {
    const c = this.custom.get(id)
    if (c) return c.ui.contextWindow ?? 0
    return AGENTS.find((a) => a.id === id)?.contextWindow ?? 0
  }
}
