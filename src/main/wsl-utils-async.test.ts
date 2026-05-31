import { describe, it, expect } from 'vitest'
import { NODE_INIT } from './wsl-utils'

describe('NODE_INIT', () => {
  it('includes nvm activation', () => {
    expect(NODE_INIT).toContain('nvm.sh')
    expect(NODE_INIT).toContain('nvm use default')
  })

  it('resets HOME to the Linux home (wsl.exe can inherit the Windows HOME)', () => {
    expect(NODE_INIT).toContain('export HOME="/home/$LOGNAME"')
  })

  it('resets NVM_DIR before sourcing nvm.sh (also inherited from Windows HOME)', () => {
    expect(NODE_INIT).toContain('export NVM_DIR="$HOME/.nvm"')
  })

  it('includes fnm activation', () => {
    expect(NODE_INIT).toContain('fnm env')
  })

  it('includes volta activation', () => {
    expect(NODE_INIT).toContain('.volta/bin')
    expect(NODE_INIT).toContain('VOLTA_HOME')
  })

  it('prepends ~/.local/bin so native CLI installs win over shadowed npm copies', () => {
    expect(NODE_INIT).toContain('.local/bin')
    // Must come after the version managers so it ends up at the front of PATH.
    expect(NODE_INIT.indexOf('.local/bin')).toBeGreaterThan(NODE_INIT.indexOf('nvm.sh'))
  })

  it('ends with semicolon-space for safe command chaining', () => {
    expect(NODE_INIT).toMatch(/; $/)
  })

  it('ends with true to ensure zero exit code', () => {
    expect(NODE_INIT).toContain('true; ')
  })
})
