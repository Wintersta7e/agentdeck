import { execFile } from 'child_process'
import { AGENT_BINARY_MAP } from '../shared/agents'
import type { Logger } from './logger'

/**
 * Detect which agent binaries are available in WSL.
 *
 * Pure async function with no dependency on Electron IPC or BrowserWindow,
 * making it independently testable.
 */
export async function detectAgents(log: Logger): Promise<Record<string, boolean>> {
  const t0 = Date.now()

  // Diagnostic: WSL environment info
  const wslDiag = (label: string, args: string[]): Promise<string> =>
    new Promise((resolve) => {
      execFile('wsl.exe', args, { timeout: 10000 }, (err, stdout, stderr) => {
        const out = stdout?.trim() ?? ''
        const errMsg = err ? ` [err: ${(err as NodeJS.ErrnoException).code ?? err.message}]` : ''
        const stderrMsg = stderr?.trim() ? ` [stderr: ${stderr.trim()}]` : ''
        log.debug(`WSL diag ${label}: "${out}"${errMsg}${stderrMsg}`)
        resolve(out)
      })
    })

  // Run diagnostics in parallel with agent checks (diagnostics are for logging only,
  // they don't gate the agent results)
  const diagnosticsPromise = Promise.all([
    wslDiag('distro', ['--status']),
    wslDiag('default-shell', ['--', 'bash', '-c', 'echo $SHELL']),
    wslDiag('bash-version', ['--', 'bash', '--version']),
    wslDiag('PATH', ['--', 'bash', '-lic', 'echo "$PATH"']),
    wslDiag('npm-global-bin', ['--', 'bash', '-lic', 'npm bin -g 2>/dev/null']),
    wslDiag('node-version', ['--', 'bash', '-lic', 'node --version 2>/dev/null']),
  ]).then(() => log.debug(`WSL diagnostics completed in ${Date.now() - t0}ms`))

  // Check each agent binary — first via PATH, then search common locations
  const check = (bin: string): Promise<boolean> =>
    new Promise((resolve) => {
      const t1 = Date.now()
      // 1) Try command -v in login+interactive bash.
      // -l (login) sources .profile which adds ~/.local/bin (standalone installer).
      // -i (interactive) sources .bashrc which loads nvm/fnm/volta PATH.
      // On Ubuntu, .profile also sources .bashrc, so -lic covers both.
      execFile(
        'wsl.exe',
        ['--', 'bash', '-lic', `command -v ${bin}`],
        { timeout: 15000 },
        (err, stdout, stderr) => {
          if (!err) {
            log.info(`Agent check: ${bin} → found (${stdout.trim()}) (${Date.now() - t1}ms)`)
            return resolve(true)
          }
          const errCode = (err as NodeJS.ErrnoException).code ?? err.message
          log.debug(
            `Agent check: ${bin} not in PATH [${errCode}]` +
              `${stderr?.trim() ? ` [stderr: ${stderr.trim()}]` : ''}` +
              ` — trying fallback search`,
          )
          // 2) Fallback: search common install locations.
          // Uses -e (exists) not -x (executable) to also catch symlinks.
          // Logs each path checked for diagnostics.
          const searchScript = [
            'found=""',
            // Standalone installer (official: curl https://claude.ai/install.sh | bash)
            // Symlink at ~/.local/bin, actual binary at ~/.local/share/<name>/versions/<ver>
            `[ -z "$found" ] && [ -e "$HOME/.local/bin/${bin}" ] && found="$HOME/.local/bin/${bin}"`,
            `[ -z "$found" ] && for f in "$HOME/.local/share/${bin}/versions/"*; do [ -f "$f" ] && found="$f" && break; done`,
            `[ -z "$found" ] && [ -e "$HOME/.claude/bin/${bin}" ] && found="$HOME/.claude/bin/${bin}"`,
            // nvm (any node version, not just active)
            `[ -z "$found" ] && for f in "$HOME/.nvm/versions/node"/*/bin/${bin}; do [ -e "$f" ] && found="$f" && break; done`,
            // System npm / custom npm prefix
            `[ -z "$found" ] && [ -e "/usr/local/bin/${bin}" ] && found="/usr/local/bin/${bin}"`,
            `[ -z "$found" ] && [ -e "$HOME/.npm-global/bin/${bin}" ] && found="$HOME/.npm-global/bin/${bin}"`,
            // volta / fnm / homebrew
            `[ -z "$found" ] && [ -e "$HOME/.volta/bin/${bin}" ] && found="$HOME/.volta/bin/${bin}"`,
            `[ -z "$found" ] && for f in "$HOME/.fnm/node-versions"/*/installation/bin/${bin}; do [ -e "$f" ] && found="$f" && break; done`,
            `[ -z "$found" ] && [ -e "/home/linuxbrew/.linuxbrew/bin/${bin}" ] && found="/home/linuxbrew/.linuxbrew/bin/${bin}"`,
            // Windows-side npm global (accessible from WSL via /mnt/c)
            `[ -z "$found" ] && for f in /mnt/c/Users/*/AppData/Roaming/npm/${bin}; do [ -e "$f" ] && found="$f" && break; done`,
            `[ -z "$found" ] && for f in /mnt/c/Users/*/AppData/Roaming/npm/${bin}.cmd; do [ -e "$f" ] && found="$f" && break; done`,
            // Windows standalone installer
            `[ -z "$found" ] && for f in /mnt/c/Users/*/AppData/Local/Programs/${bin}/${bin}.exe; do [ -e "$f" ] && found="$f" && break; done`,
            `[ -z "$found" ] && for f in /mnt/c/Users/*/.claude/local/${bin}.exe; do [ -e "$f" ] && found="$f" && break; done`,
            // Result
            `[ -n "$found" ] && echo "$found" && exit 0`,
            `exit 1`,
          ].join('; ')
          execFile(
            'wsl.exe',
            ['--', 'bash', '-c', searchScript],
            { timeout: 10000 },
            (err2, stdout2) => {
              const found = !err2 && !!stdout2.trim()
              log.info(
                `Agent check: ${bin} → ${found ? `found via fallback (${stdout2.trim()})` : 'NOT FOUND anywhere'}` +
                  ` (${Date.now() - t1}ms)`,
              )
              resolve(found)
            },
          )
        },
      )
    })

  // Limit concurrency to avoid spawning too many wsl.exe processes at once
  // (each check can spawn 2 processes: PATH check + fallback search)
  const MAX_CONCURRENT = 3
  const entries = Object.entries(AGENT_BINARY_MAP)
  const checkWithLimit = async (): Promise<boolean[]> => {
    const results: boolean[] = new Array(entries.length)
    let idx = 0
    const run = async (): Promise<void> => {
      while (idx < entries.length) {
        const i = idx++
        const entry = entries[i]
        if (entry) results[i] = await check(entry[1])
      }
    }
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, entries.length) }, () => run()))
    return results
  }
  const [, results] = await Promise.all([diagnosticsPromise, checkWithLimit()])
  log.info(`Agent detection total: ${Date.now() - t0}ms`)
  return Object.fromEntries(entries.map(([name], i) => [name, results[i] ?? false])) as Record<
    string,
    boolean
  >
}
