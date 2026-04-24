import { createLogger } from '../logger'
import { readWslEnv, readWslFile, resolveWslPath } from './_shared'

const log = createLogger('detector:claude-code')
let warnedOnce = false

export interface DetectorOutput {
  modelId: string | null
  cliContextOverride?: number
}

export async function readClaudeCodeActiveModel(): Promise<DetectorOutput> {
  const envDir = await readWslEnv('CLAUDE_CONFIG_DIR')
  const expr = envDir ? `${envDir}/settings.json` : '$HOME/.claude/settings.json'
  const resolved = await resolveWslPath(expr)
  if (!resolved) return { modelId: null }

  const raw = await readWslFile(resolved)
  if (!raw) return { modelId: null }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const model = parsed.model
    if (typeof model === 'string' && model.length > 0) return { modelId: model }
    return { modelId: null }
  } catch (err) {
    if (!warnedOnce) {
      log.warn('Malformed Claude Code settings.json', { path: resolved, error: String(err) })
      warnedOnce = true
    }
    return { modelId: null }
  }
}
