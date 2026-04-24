import { parse as parseYaml } from 'yaml'
import { createLogger } from '../logger'
import { readWslEnv, readWslFile, resolveWslPath } from './_shared'
import type { DetectorOutput } from './claude-code'

const log = createLogger('detector:goose')
let warnedOnce = false

export async function readGooseActiveModel(): Promise<DetectorOutput> {
  // Goose precedence: env > config file > defaults
  const envModel = await readWslEnv('GOOSE_MODEL')
  if (envModel && envModel.length > 0) return { modelId: envModel }

  const envDir = await readWslEnv('GOOSE_CONFIG_DIR')
  const expr = envDir ? `${envDir}/config.yaml` : '$HOME/.config/goose/config.yaml'
  const resolved = await resolveWslPath(expr)
  if (!resolved) return { modelId: null }

  const raw = await readWslFile(resolved)
  if (!raw) return { modelId: null }

  try {
    const parsed = parseYaml(raw) as Record<string, unknown> | null
    if (!parsed || typeof parsed !== 'object') return { modelId: null }
    const flat = parsed.GOOSE_MODEL
    if (typeof flat === 'string' && flat.length > 0) return { modelId: flat }
    return { modelId: null }
  } catch (err) {
    if (!warnedOnce) {
      log.warn('Malformed Goose config.yaml', { path: resolved, error: String(err) })
      warnedOnce = true
    }
    return { modelId: null }
  }
}
