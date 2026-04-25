import { execFile } from 'node:child_process'
import { getDefaultDistroAsync, NODE_INIT } from './wsl-utils'
import { createLogger } from './logger'
import { shellQuote } from './node-runners'

const log = createLogger('files-gitignore')

const GIT_TIMEOUT_MS = 5000

/**
 * Run `git check-ignore --stdin` against a list of path names, returning
 * the subset that git reports as ignored. Best-effort: returns an empty
 * set on any failure (non-git dir, git missing, timeout). Names are
 * joined under `dirRelPath` (relative to `projectPath`) before being piped
 * to git so the pathspecs match the project tree. The `|| true` in the
 * shell command swallows git's exit-1 when nothing matches — we don't want
 * `execFile` to surface that as an error.
 */
export async function gitignoreCheck(
  projectPath: string,
  dirRelPath: string,
  names: string[],
): Promise<Set<string>> {
  if (names.length === 0) return new Set()

  const distro = await getDefaultDistroAsync()
  const stdinPaths = names.map((n) => (dirRelPath ? `${dirRelPath}/${n}` : n)).join('\n')

  const inner = `${NODE_INIT}cd ${shellQuote(projectPath)} && git check-ignore --stdin || true`

  return new Promise<Set<string>>((resolve) => {
    const child = execFile(
      'wsl.exe',
      ['-d', distro, '--', 'bash', '-lc', inner],
      { encoding: 'utf8', timeout: GIT_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          log.debug('gitignoreCheck failed (treating as no-ignores)', {
            err: String(err),
            projectPath,
          })
          resolve(new Set())
          return
        }
        const ignoredFull = stdout
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
        const set = new Set<string>()
        for (const full of ignoredFull) {
          const name = dirRelPath ? full.slice(dirRelPath.length + 1) : full
          if (names.includes(name)) set.add(name)
        }
        resolve(set)
      },
    )
    child.stdin?.write(stdinPaths)
    child.stdin?.end()
  })
}
