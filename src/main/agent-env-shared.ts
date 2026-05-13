import { readWslFileSafe } from './wsl-paths'
import type { Logger } from './logger'

export const MAX_VALUE_LEN = 200

export function truncate(s: string): string {
  return s.length > MAX_VALUE_LEN ? s.slice(0, MAX_VALUE_LEN) + '…' : s
}

export interface ReadOpts {
  projectPath?: string | undefined
}

export async function readWslParsed<T>(
  path: string,
  parse: (text: string) => T | null,
  log: Logger,
): Promise<T | null> {
  const text = await readWslFileSafe(path)
  if (text === null) return null
  try {
    return parse(text)
  } catch (err) {
    log.debug('parse failed', { path, err: String(err) })
    return null
  }
}
