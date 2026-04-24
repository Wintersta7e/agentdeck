import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createLogger } from '../logger'
import type { DetectorOutput } from './claude-code'

const log = createLogger('detector:amazon-q')
const execFileAsync = promisify(execFile)
const TIMEOUT_MS = 10_000

async function trySubprocess(args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('wsl.exe', args, { timeout: TIMEOUT_MS })
    const out = (stdout ?? '').trim()
    return out.length > 0 ? out : null
  } catch {
    return null
  }
}

/**
 * Best-effort read. AWS documents `q settings chat.defaultModel <value>` as
 * the setter form; the read form is unverified against current docs. Try the
 * implicit read first, then the explicit `get` form, then give up and let the
 * resolver fall through to the Amazon Q registry default.
 */
export async function readAmazonQActiveModel(): Promise<DetectorOutput> {
  const forms: string[][] = [
    ['-e', 'q', 'settings', 'chat.defaultModel'],
    ['-e', 'q', 'settings', 'get', 'chat.defaultModel'],
  ]
  for (const args of forms) {
    const out = await trySubprocess(args)
    if (out) return { modelId: out }
  }
  log.debug('Amazon Q model detection fell through — no readable form found')
  return { modelId: null }
}
