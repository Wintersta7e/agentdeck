/**
 * Shared custom-agent spec + validation. Pure (no IO) so it is usable from main
 * (load/save) AND the renderer (live form validation). The on-disk `agents.toml`
 * deserializes to `unknown`; `validateCustomAgent` is the single gate that turns
 * it into a trusted `CustomAgentSpec`.
 */
import { SAFE_ID_RE, MAX_SAFE_ID_LEN } from './validation'

export interface CustomAgentUi {
  name: string
  icon?: string
  short?: string
  /** Full CSS var name from CURATED_COLOR_VARS (e.g. "--accent"). */
  colorVar?: string
  description?: string
  contextWindow?: number
  versionArgs?: string[]
}

/**
 * Redacted, renderer-safe view of an agent. NEVER carries args/env (main-only).
 * Lives in shared/ (not the main-only agent-registry) so the IPC bridge can
 * import it without dragging a main module into shared/renderer code.
 */
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

export interface CustomAgentSpec {
  id: string
  binary: string
  args?: string[]
  env?: Record<string, string>
  ui: CustomAgentUi
  source: 'user'
}

/** Fields a built-in agent definition contributes to its wire descriptor. */
type BuiltinAgentLike = Pick<
  AgentDescriptorWire,
  'id' | 'binary' | 'name' | 'icon' | 'short' | 'colorVar' | 'description' | 'contextWindow'
>

/**
 * Map a built-in agent definition to its renderer-safe wire descriptor. Shared
 * by the main registry and the renderer's bootstrap seed so the two stay in lockstep.
 */
export function toBuiltinDescriptor(a: BuiltinAgentLike): AgentDescriptorWire {
  return {
    id: a.id,
    binary: a.binary,
    name: a.name,
    icon: a.icon,
    short: a.short,
    colorVar: a.colorVar,
    description: a.description,
    contextWindow: a.contextWindow,
    source: 'builtin',
  }
}

/**
 * A custom agent's binary is interpolated into a WSL shell. This charset forbids
 * spaces, a leading dash, and every shell metacharacter, so a charset-valid
 * binary cannot inject regardless of quoting (quoting at spawn is defense-in-depth).
 * Implies a PATH-resolvable command name (no absolute/`./`/`~` paths) for Phase 1.
 */
export const AGENT_BINARY_RE = /^[A-Za-z0-9_][A-Za-z0-9_./-]*$/

/** Theme-variant accent tokens a custom agent may pick (defined per theme in tokens.css). */
export const CURATED_COLOR_VARS = ['--accent', '--green', '--red', '--blue', '--purple'] as const
const DEFAULT_COLOR_VAR = '--accent'

/**
 * Env vars that can hijack the child process via the dynamic linker or a shell /
 * runtime startup hook. Rejected from a custom agent's env as best-effort
 * defense-in-depth: a denylist is inherently non-exhaustive, but the real
 * boundary here is trust — the env comes from the user's own agents.toml on their
 * own machine (they could run the command directly), so this guards against
 * footguns and a hostile imported file, not a privileged attacker. Superset of
 * the original ipc-pty BLOCKED_ENV, which consumes this set (see ipc-pty).
 */
export const BLOCKED_ENV_KEYS: ReadonlySet<string> = new Set([
  // dynamic-linker hijacks
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'LD_AUDIT',
  'LD_PROFILE',
  // shell / Node / Electron startup hooks
  'BASH_ENV',
  'ENV',
  'NODE_OPTIONS',
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ASAR',
])

const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

const LIMIT = {
  binary: 256,
  name: 64,
  description: 200,
  // Generous over the modal's maxLength=4 to allow multi-code-unit emoji glyphs.
  icon: 8,
  short: 8,
  argCount: 32,
  argLen: 256,
  envCount: 32,
  envValLen: 512,
}

/**
 * Name-heuristic for secret-shaped env keys. Phase 1 stores env in plaintext, so
 * we steer obvious secrets to Phase 2 (safeStorage). Not a proof of non-secrecy —
 * a secret under a benign key name still gets through (documented limitation).
 */
export function looksLikeCredentialKey(key: string): boolean {
  const k = key.toUpperCase()
  return (
    k.includes('TOKEN') ||
    k.includes('SECRET') ||
    k.includes('PASSWORD') ||
    k.includes('PASSWD') ||
    k.includes('CREDENTIAL') ||
    k.includes('AUTH') ||
    k.includes('APIKEY') ||
    k.includes('API_KEY') ||
    k.endsWith('_KEY') ||
    k.endsWith('_PAT')
  )
}

export type ValidateResult = { ok: true; value: CustomAgentSpec } | { ok: false; error: string }

const fail = (error: string): ValidateResult => ({ ok: false, error })

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function deriveShort(name: string): string {
  const alnum = name.replace(/[^A-Za-z0-9]/g, '')
  return (alnum.slice(0, 2) || name.slice(0, 2)).toUpperCase()
}

/**
 * Validate one raw agent entry against the Phase-1 rules. `builtinIds` is the set
 * of reserved built-in ids that a custom agent may not shadow.
 */
export function validateCustomAgent(raw: unknown, builtinIds: ReadonlySet<string>): ValidateResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('agent must be an object')
  const r = raw as Record<string, unknown>

  const id = r['id']
  if (typeof id !== 'string' || !id || id.length > MAX_SAFE_ID_LEN || !SAFE_ID_RE.test(id))
    return fail(
      `invalid agent id (must match ${String(SAFE_ID_RE)} and be <= ${MAX_SAFE_ID_LEN} chars)`,
    )
  if (builtinIds.has(id)) return fail(`id "${id}" is already used by a built-in agent`)

  const binary = r['binary']
  if (
    typeof binary !== 'string' ||
    !binary ||
    binary.length > LIMIT.binary ||
    !AGENT_BINARY_RE.test(binary)
  )
    return fail('invalid binary (a command name; no spaces, leading dash, or shell metacharacters)')

  const rawUi = r['ui']
  if (!rawUi || typeof rawUi !== 'object' || Array.isArray(rawUi)) return fail('ui is required')
  const u = rawUi as Record<string, unknown>

  const name = u['name']
  if (typeof name !== 'string' || !name || name.length > LIMIT.name)
    return fail(`ui.name is required (<= ${LIMIT.name} chars)`)

  const description = u['description']
  if (
    description !== undefined &&
    (typeof description !== 'string' || description.length > LIMIT.description)
  )
    return fail(`ui.description must be a string <= ${LIMIT.description} chars`)

  const contextWindow = u['contextWindow']
  if (
    contextWindow !== undefined &&
    (typeof contextWindow !== 'number' || !Number.isInteger(contextWindow) || contextWindow < 0)
  )
    return fail('ui.contextWindow must be a non-negative integer')

  let versionArgs: string[] | undefined
  const versionArgsRaw = u['versionArgs']
  if (versionArgsRaw !== undefined) {
    if (!isStringArray(versionArgsRaw) || versionArgsRaw.length > LIMIT.argCount)
      return fail('ui.versionArgs must be a string array')
    if (versionArgsRaw.some((a) => /\s/.test(a)))
      return fail('each ui.versionArgs entry must be a single token (no whitespace)')
    versionArgs = versionArgsRaw
  }

  const iconRaw = u['icon']
  if (iconRaw !== undefined && (typeof iconRaw !== 'string' || iconRaw.length > LIMIT.icon))
    return fail(`ui.icon must be a string <= ${LIMIT.icon} chars`)
  const icon = typeof iconRaw === 'string' && iconRaw ? iconRaw : '●'

  const shortRaw = u['short']
  if (shortRaw !== undefined && (typeof shortRaw !== 'string' || shortRaw.length > LIMIT.short))
    return fail(`ui.short must be a string <= ${LIMIT.short} chars`)
  const short = typeof shortRaw === 'string' && shortRaw ? shortRaw : deriveShort(name)
  const colorVarRaw = u['colorVar']
  const colorVar =
    typeof colorVarRaw === 'string' &&
    (CURATED_COLOR_VARS as readonly string[]).includes(colorVarRaw)
      ? colorVarRaw
      : DEFAULT_COLOR_VAR

  let args: string[] | undefined
  const argsRaw = r['args']
  if (argsRaw !== undefined) {
    if (!isStringArray(argsRaw)) return fail('args must be a string array')
    if (argsRaw.length > LIMIT.argCount) return fail(`args must have <= ${LIMIT.argCount} items`)
    if (argsRaw.some((a) => a.length > LIMIT.argLen))
      return fail(`each arg must be <= ${LIMIT.argLen} chars`)
    // The Agents modal edits args as one whitespace-joined field and re-splits
    // on save, so a whitespace-bearing arg cannot round-trip losslessly. Reject
    // it here so the data model matches what the modal can faithfully represent.
    if (argsRaw.some((a) => /\s/.test(a)))
      return fail('each arg must be a single token (no whitespace)')
    args = argsRaw
  }

  let env: Record<string, string> | undefined
  const envRaw = r['env']
  if (envRaw !== undefined) {
    if (!envRaw || typeof envRaw !== 'object' || Array.isArray(envRaw))
      return fail('env must be an object')
    const entries = Object.entries(envRaw as Record<string, unknown>)
    if (entries.length > LIMIT.envCount) return fail(`env must have <= ${LIMIT.envCount} keys`)
    const out: Record<string, string> = {}
    for (const [k, val] of entries) {
      if (!ENV_KEY_RE.test(k)) return fail(`invalid env key "${k}"`)
      if (BLOCKED_ENV_KEYS.has(k)) return fail(`env key "${k}" is not allowed`)
      if (looksLikeCredentialKey(k))
        return fail(`env key "${k}" looks like a secret — secrets arrive in Phase 2 secure storage`)
      if (typeof val !== 'string' || val.length > LIMIT.envValLen)
        return fail(`env value for "${k}" must be a string <= ${LIMIT.envValLen} chars`)
      out[k] = val
    }
    env = out
  }

  const ui: CustomAgentUi = {
    name,
    icon,
    short,
    colorVar,
    ...(description !== undefined ? { description } : {}),
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    ...(versionArgs !== undefined ? { versionArgs } : {}),
  }
  const value: CustomAgentSpec = {
    id,
    binary,
    ui,
    source: 'user',
    ...(args !== undefined ? { args } : {}),
    ...(env !== undefined ? { env } : {}),
  }
  return { ok: true, value }
}
