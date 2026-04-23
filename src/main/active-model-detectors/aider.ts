import { parse as parseYaml } from 'yaml'
import { createLogger } from '../logger'
import { readWslEnv, readWslFile, resolveWslPath } from './_shared'
import type { DetectorOutput } from './claude-code'

const log = createLogger('detector:aider')
let warnedOnce = false

export async function readAiderActiveModel(): Promise<DetectorOutput> {
  // ConfigArgParse precedence: command-line > env > config file > defaults.
  // Env wins over the config file.
  const envModel = await readWslEnv('AIDER_MODEL')
  if (envModel && envModel.length > 0) return { modelId: envModel }

  const resolved = await resolveWslPath('$HOME/.aider.conf.yml')
  if (!resolved) return { modelId: null }
  const raw = await readWslFile(resolved)
  if (!raw) return { modelId: null }

  try {
    const parsed = parseYaml(raw) as Record<string, unknown> | null
    if (!parsed || typeof parsed !== 'object') return { modelId: null }
    const model = parsed.model
    if (typeof model === 'string' && model.length > 0) return { modelId: model }
    return { modelId: null }
  } catch (err) {
    if (!warnedOnce) {
      log.warn('Malformed Aider .aider.conf.yml', { path: resolved, error: String(err) })
      warnedOnce = true
    }
    return { modelId: null }
  }
}
