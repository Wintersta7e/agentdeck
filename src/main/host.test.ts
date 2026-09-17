import { describe, it, expect, afterEach } from 'vitest'
import { hostPlatform, bashCommand, directCommand, loginShell, gitEnv, shellVar } from './host'

const realPlatform = process.platform
const setPlatform = (value: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', { value, configurable: true })
}

afterEach(() => {
  setPlatform(realPlatform)
})

describe('hostPlatform', () => {
  it('is wsl on Windows, where agents live inside the WSL VM', () => {
    setPlatform('win32')
    expect(hostPlatform()).toBe('wsl')
  })

  it('is native on Linux, where agents are just local processes', () => {
    setPlatform('linux')
    expect(hostPlatform()).toBe('native')
  })
})

describe('bashCommand', () => {
  it('routes through wsl.exe on Windows', () => {
    setPlatform('win32')
    expect(bashCommand('echo hi')).toEqual({
      file: 'wsl.exe',
      args: ['--', 'bash', '-lc', 'echo hi'],
    })
  })

  it('targets a named distro when one is given', () => {
    setPlatform('win32')
    expect(bashCommand('echo hi', { distro: 'Debian' })).toEqual({
      file: 'wsl.exe',
      args: ['-d', 'Debian', '--', 'bash', '-lc', 'echo hi'],
    })
  })

  it('runs bash directly on Linux', () => {
    setPlatform('linux')
    expect(bashCommand('echo hi')).toEqual({ file: 'bash', args: ['-lc', 'echo hi'] })
  })

  // A distro is a WSL concept. Honouring it natively would run the command in
  // the wrong place, so it is ignored rather than passed along.
  it('ignores a distro on Linux', () => {
    setPlatform('linux')
    expect(bashCommand('echo hi', { distro: 'Debian' })).toEqual({
      file: 'bash',
      args: ['-lc', 'echo hi'],
    })
  })
})

describe('directCommand', () => {
  it('prefixes wsl.exe -- on Windows so the program runs inside the VM', () => {
    setPlatform('win32')
    expect(directCommand('git', ['status'])).toEqual({
      file: 'wsl.exe',
      args: ['--', 'git', 'status'],
    })
  })

  it('runs the program itself on Linux', () => {
    setPlatform('linux')
    expect(directCommand('git', ['status'])).toEqual({ file: 'git', args: ['status'] })
  })
})

describe('loginShell', () => {
  it('is wsl.exe with no args on Windows — it opens the default distro shell', () => {
    setPlatform('win32')
    expect(loginShell()).toEqual({ file: 'wsl.exe', args: [] })
  })

  it('is an interactive bash login shell on Linux', () => {
    setPlatform('linux')
    expect(loginShell()).toEqual({ file: 'bash', args: ['-il'] })
  })
})

describe('gitEnv', () => {
  // git exports these to any process it spawns — notably hook scripts. A git
  // child that inherits them silently operates on the *parent's* repo:
  // `fatal: .git/index: index file open failed: Not a directory`. wsl.exe hid
  // this by starting a fresh environment inside the VM; running git directly
  // does not.
  it('drops the variables that pin git to another repository', () => {
    const env = gitEnv({
      GIT_DIR: '.git',
      GIT_INDEX_FILE: '.git/index',
      GIT_WORK_TREE: '/somewhere',
      GIT_PREFIX: 'sub/',
      GIT_COMMON_DIR: '.git',
      GIT_OBJECT_DIRECTORY: '.git/objects',
      GIT_ALTERNATE_OBJECT_DIRECTORIES: '/other/objects',
      GIT_NAMESPACE: 'ns',
      PATH: '/usr/bin',
    })
    expect(env).toEqual({ PATH: '/usr/bin' })
  })

  it('keeps everything else, including git settings that are not repo-scoped', () => {
    const env = gitEnv({ HOME: '/home/u', GIT_AUTHOR_NAME: 'Someone', GIT_SSH_COMMAND: 'ssh -v' })
    expect(env).toEqual({ HOME: '/home/u', GIT_AUTHOR_NAME: 'Someone', GIT_SSH_COMMAND: 'ssh -v' })
  })
})

describe('shellVar', () => {
  // wsl.exe strips an unescaped `$` out of its argv, so a runtime shell
  // variable has to arrive as `\$`. Sent to a local bash the same string is a
  // literal "$name" — non-empty — which quietly makes `[ -n "\$found" ]`
  // always true and every probe that uses it succeed.
  it('escapes the dollar for the wsl.exe argv transport', () => {
    setPlatform('win32')
    expect(shellVar('found')).toBe('\\$found')
  })

  it('leaves it bare for a local bash, which gets the string verbatim', () => {
    setPlatform('linux')
    expect(shellVar('found')).toBe('$found')
  })
})
