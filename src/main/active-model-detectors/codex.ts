import { parse as parseToml } from 'smol-toml'
import { createLogger } from '../logger'
import { readWslEnv, readWslFile, resolveWslPath } from './_shared'
import type { DetectorOutput } from './claude-code'

const log = createLogger('detector:codex')
let warnedOnce = false

export async function readCodexActiveModel(): Promise<DetectorOutput> {
  const envHome = await readWslEnv('CODEX_HOME')
  const expr = envHome ? `${envHome}/config.toml` : '$HOME/.codex/config.toml'
  const resolved = await resolveWslPath(expr)
  if (!resolved) return { modelId: null }

  const raw = await readWslFile(resolved)
  if (!raw) return { modelId: null }

  try {
    const parsed = parseToml(raw) as Record<string, unknown>
    const model = parsed.model
    const ctx = parsed.model_context_window
    const out: DetectorOutput = {
      modelId: typeof model === 'string' && model.length > 0 ? model : null,
    }
    if (typeof ctx === 'number' && Number.isFinite(ctx) && ctx > 0) {
      out.cliContextOverride = ctx
    } else if (typeof ctx === 'bigint' && ctx > 0n) {
      out.cliContextOverride = Number(ctx)
    }
    return out
  } catch (err) {
    if (!warnedOnce) {
      log.warn('Malformed Codex config.toml', { path: resolved, error: String(err) })
      warnedOnce = true
    }
    return { modelId: null }
  }
}
