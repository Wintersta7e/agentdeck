/**
 * Where agent processes actually run, and how to reach them.
 *
 * On Windows the app is a Windows process while every agent, git call and
 * terminal lives inside the WSL VM, so each command is routed through
 * `wsl.exe`. On Linux the app and the agents are on the same machine, and the
 * same routing would be wrong — there is no `wsl.exe`, and even where WSL
 * interop makes one reachable it would launch a *nested* WSL session.
 *
 * Every command builder lives here so the platform test is made once. Callers
 * take `{ file, args }` and hand it straight to execFile / spawn / pty.spawn.
 */

export type HostPlatform = 'wsl' | 'native'

export interface HostCommand {
  file: string
  args: string[]
}

/** 'wsl' when agents live inside the WSL VM (Windows), 'native' otherwise. */
export function hostPlatform(): HostPlatform {
  return process.platform === 'win32' ? 'wsl' : 'native'
}

export interface BashOptions {
  /** WSL distribution to target. Ignored natively, where it has no meaning. */
  distro?: string
  /**
   * bash flags. Default '-lc' (login, non-interactive). '-lic' additionally
   * sources .bashrc, which is where nvm/fnm put agent binaries on PATH.
   */
  flags?: string
}

/** Run a shell command line through bash. */
export function bashCommand(cmd: string, opts: BashOptions = {}): HostCommand {
  const flags = opts.flags ?? '-lc'
  if (hostPlatform() === 'native') {
    return { file: 'bash', args: [flags, cmd] }
  }
  return {
    file: 'wsl.exe',
    args: opts.distro ? ['-d', opts.distro, '--', 'bash', flags, cmd] : ['--', 'bash', flags, cmd],
  }
}

/** Run a program with an argument vector, without a shell in between. */
export function directCommand(file: string, args: string[], distro?: string): HostCommand {
  if (hostPlatform() === 'native') {
    return { file, args }
  }
  return {
    file: 'wsl.exe',
    args: distro ? ['-d', distro, '--', file, ...args] : ['--', file, ...args],
  }
}

/**
 * The interactive shell a terminal session attaches to. Bare `wsl.exe` opens
 * the default distro's login shell; natively we ask bash for the same thing.
 */
export function loginShell(distro?: string): HostCommand {
  if (hostPlatform() === 'native') {
    return { file: 'bash', args: ['-il'] }
  }
  return { file: 'wsl.exe', args: distro ? ['-d', distro] : [] }
}

/**
 * Variables git exports to the processes it spawns — hook scripts above all.
 * A git child that inherits them operates on the *parent's* repository, which
 * surfaces as `fatal: .git/index: index file open failed: Not a directory`
 * when the target is a worktree. Routing through `wsl.exe` hid this by
 * starting a fresh environment inside the VM; running git directly does not.
 */
const REPO_SCOPED_GIT_VARS = new Set([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_PREFIX',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
])

/** Environment for a git child process, with the repo-pointing vars removed. */
export function gitEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(base).filter(([key]) => !REPO_SCOPED_GIT_VARS.has(key)))
}
