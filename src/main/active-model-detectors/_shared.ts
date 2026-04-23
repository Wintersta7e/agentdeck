import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

// Same pattern as src/main/git-status.ts — promisified execFile, wsl.exe
// subprocess with a 10s timeout, null on any failure, never throws.
const execFileAsync = promisify(execFile)
const TIMEOUT_MS = 10_000

async function runWsl(args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('wsl.exe', args, { timeout: TIMEOUT_MS })
    return stdout ?? ''
  } catch {
    return null
  }
}

/**
 * Read a file inside WSL via `wsl.exe -e cat <path>`.
 * Returns raw stdout (with trailing newline) or null on any failure.
 */
export async function readWslFile(wslPath: string): Promise<string | null> {
  return runWsl(['-e', 'cat', wslPath])
}

/**
 * Read an env var from inside WSL. Returns trimmed value, or null when unset/empty.
 */
export async function readWslEnv(name: string): Promise<string | null> {
  const out = await runWsl(['-e', 'sh', '-c', `echo "$${name}"`])
  if (out === null) return null
  const trimmed = out.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Resolve a path expression (may contain `$VAR` / `~`) via shell expansion inside WSL.
 * Returns the expanded trimmed path or null on failure.
 */
export async function resolveWslPath(expr: string): Promise<string | null> {
  const out = await runWsl(['-e', 'sh', '-c', `printf '%s' ${expr}`])
  if (out === null) return null
  const trimmed = out.trim()
  return trimmed.length > 0 ? trimmed : null
}
