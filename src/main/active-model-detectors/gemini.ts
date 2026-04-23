import { createLogger } from '../logger'
import { readWslFile, resolveWslPath } from './_shared'
import type { DetectorOutput } from './claude-code'

const log = createLogger('detector:gemini')
let warnedOnce = false

export async function readGeminiActiveModel(): Promise<DetectorOutput> {
  const resolved = await resolveWslPath('$HOME/.gemini/settings.json')
  if (!resolved) return { modelId: null }
  const raw = await readWslFile(resolved)
  if (!raw) return { modelId: null }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    // Primary: nested model.name (current releases)
    const modelObj = parsed.model
    if (modelObj && typeof modelObj === 'object' && !Array.isArray(modelObj)) {
      const name = (modelObj as Record<string, unknown>).name
      if (typeof name === 'string' && name.length > 0) return { modelId: name }
    }
    // Fallback: top-level string model (older/degenerate shape)
    if (typeof modelObj === 'string' && modelObj.length > 0) return { modelId: modelObj }
    return { modelId: null }
  } catch (err) {
    if (!warnedOnce) {
      log.warn('Malformed Gemini settings.json', { path: resolved, error: String(err) })
      warnedOnce = true
    }
    return { modelId: null }
  }
}
