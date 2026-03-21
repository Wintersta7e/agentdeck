import { describe, it, expect } from 'vitest'
import { NODE_INIT } from '../wsl-utils'

describe('NODE_INIT', () => {
  it('includes nvm activation', () => {
    expect(NODE_INIT).toContain('.nvm/nvm.sh')
  })

  it('includes fnm activation', () => {
    expect(NODE_INIT).toContain('fnm env')
  })

  it('includes volta activation', () => {
    expect(NODE_INIT).toContain('.volta/bin')
    expect(NODE_INIT).toContain('VOLTA_HOME')
  })

  it('ends with semicolon-space for safe command chaining', () => {
    expect(NODE_INIT).toMatch(/; $/)
  })

  it('ends with true to ensure zero exit code', () => {
    expect(NODE_INIT).toContain('true; ')
  })
})
