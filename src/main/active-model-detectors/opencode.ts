import { parse as parseJsonc } from 'jsonc-parser'
import { createLogger } from '../logger'
import { readWslEnv, readWslFile, resolveWslPath } from './_shared'
import type { DetectorOutput } from './claude-code'

const log = createLogger('detector:opencode')
let warnedOnce = false

export async function readOpenCodeActiveModel(): Promise<DetectorOutput> {
  const envFile = await readWslEnv('OPENCODE_CONFIG')
  const expr = envFile ? envFile : '$HOME/.config/opencode/opencode.json'
  const resolved = await resolveWslPath(expr)
  if (!resolved) return { modelId: null }

  const raw = await readWslFile(resolved)
  if (!raw) return { modelId: null }

  try {
    const errors: unknown[] = []
    const parsed = parseJsonc(raw, errors as never) as Record<string, unknown> | undefined
    if (!parsed || typeof parsed !== 'object') return { modelId: null }
    const model = parsed.model
    // Raw provider-prefixed id is returned as-is (e.g. 'anthropic/claude-sonnet-4-5').
    // normalizeModelId strips the prefix inside findModelById for registry lookup.
    if (typeof model === 'string' && model.length > 0) return { modelId: model }
    return { modelId: null }
  } catch (err) {
    if (!warnedOnce) {
      log.warn('Malformed OpenCode opencode.json', { path: resolved, error: String(err) })
      warnedOnce = true
    }
    return { modelId: null }
  }
}
