/**
 * Single source of truth for `wsl.exe -- bash -lc <cmd>` invocations.
 *
 * Replaces the four near-identical `wslExec` / `runWslCmd` helpers that
 * previously lived in cost-tracker, skill-scanner, wsl-paths, and
 * agent-updater. Each caller picks an error mode (`throw` or `nullable`)
 * and an optional distro / timeout / NODE_INIT prefix; everything else is
 * shared.
 */

import { execFile } from 'child_process'
import { createLogger } from './logger'
import { NODE_INIT } from './wsl-utils'

const log = createLogger('wsl-exec')

interface WslExecCommonOptions {
  /** WSL distribution to target. Omit for the default distro. */
  distro?: string
  /** Hard timeout in ms. Default 15000. */
  timeout?: number
  /**
   * Prefix the command with NODE_INIT (the nvm/fnm bootstrap snippet) so
   * `node`, `npm`, etc. resolve to WSL versions. Default false.
   */
  prefixNodeInit?: boolean
}

export interface WslExecThrowOptions extends WslExecCommonOptions {
  /**
   * If a non-zero exit code still produced stdout, return that stdout
   * instead of throwing. Useful for npm/pip commands that warn on stderr
   * but succeed enough to give a valid version. Default false.
   */
  fallbackStderrAsOutput?: boolean
}

export interface WslExecNullableOptions extends WslExecCommonOptions {
  /** Log level on error. Default 'silent'. */
  logLevelOnError?: 'silent' | 'debug' | 'warn'
}

const DEFAULT_TIMEOUT = 15_000

/** Shell-safe single-quote escaping. */
export function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

function buildArgs(cmd: string, opts: WslExecCommonOptions): string[] {
  const fullCmd = opts.prefixNodeInit ? NODE_INIT + cmd : cmd
  return opts.distro
    ? ['-d', opts.distro, '--', 'bash', '-lc', fullCmd]
    : ['--', 'bash', '-lc', fullCmd]
}

/**
 * Run a command in WSL bash. Resolves with stdout on success; rejects on
 * error. Use `wslTry` if you'd rather treat failures as `null`.
 */
export function wslRun(cmd: string, opts: WslExecThrowOptions = {}): Promise<string> {
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT
  return new Promise<string>((resolve, reject) => {
    execFile('wsl.exe', buildArgs(cmd, opts), { timeout }, (err, stdout, stderr) => {
      const out = stdout?.trim() ?? ''
      if (err) {
        if (opts.fallbackStderrAsOutput && out) {
          log.debug('Command had stderr but produced output', { cmd, stderr: stderr?.trim() })
          resolve(out)
          return
        }
        reject(new Error(stderr?.trim() || err.message))
        return
      }
      resolve(stdout)
    })
  })
}

/**
 * Run a command in WSL bash. Resolves with stdout on success or `null` on
 * any failure. Use this when the caller cannot meaningfully recover from a
 * specific failure mode and just wants a best-effort string back.
 */
export function wslTry(cmd: string, opts: WslExecNullableOptions = {}): Promise<string | null> {
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT
  const logLevel = opts.logLevelOnError ?? 'silent'
  return new Promise<string | null>((resolve) => {
    execFile(
      'wsl.exe',
      buildArgs(cmd, opts),
      { timeout, encoding: 'utf-8' },
      (err, stdout, stderr) => {
        if (err) {
          if (logLevel !== 'silent') {
            log[logLevel]('wslTry failed', { cmd: cmd.slice(0, 120), err: String(err) })
          }
          resolve(null)
          return
        }
        if (stderr.trim() && logLevel === 'warn') {
          log.debug('wslTry stderr', { cmd: cmd.slice(0, 120), stderr: stderr.slice(0, 500) })
        }
        resolve(stdout)
      },
    )
  })
}
