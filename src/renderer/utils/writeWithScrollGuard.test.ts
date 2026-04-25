import { describe, it, expect, vi } from 'vitest'
import { writeWithScrollGuard } from './terminal-utils'
import type { ScrollGuardTerminal } from './terminal-utils'

/** Create a mock terminal with buffer-line scroll lock API */
function makeTerm(): ScrollGuardTerminal & { lastCallback: (() => void) | undefined } {
  const mock: ScrollGuardTerminal & { lastCallback: (() => void) | undefined } = {
    write: vi.fn(((_data: string, cb?: () => void) => {
      mock.lastCallback = cb
    }) as ScrollGuardTerminal['write']),
    scrollToLine: vi.fn(),
    buffer: {
      active: {
        viewportY: 0,
        baseY: 0,
      },
    },
    lastCallback: undefined,
  }
  return mock
}

describe('writeWithScrollGuard', () => {
  it('writes data through term.write', () => {
    const term = makeTerm()
    writeWithScrollGuard(term, 'hello')
    expect(term.write).toHaveBeenCalled()
    const calls = (term.write as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0]?.[0]).toBe('hello')
  })

  it('does not scroll when at bottom (viewportY === baseY)', () => {
    const term = makeTerm()
    term.buffer.active.viewportY = 100
    term.buffer.active.baseY = 100

    writeWithScrollGuard(term, 'data')
    // Simulate xterm processing — baseY grows
    term.buffer.active.baseY = 105
    term.lastCallback?.()

    expect(term.scrollToLine).not.toHaveBeenCalled()
  })

  it('restores scroll when scrolled up (viewportY < baseY)', () => {
    const term = makeTerm()
    term.buffer.active.viewportY = 50
    term.buffer.active.baseY = 100

    writeWithScrollGuard(term, 'data')
    // Simulate xterm processing — baseY grows, viewportY may drift
    term.buffer.active.baseY = 110
    term.buffer.active.viewportY = 60
    term.lastCallback?.()

    // Should restore to the captured position (50), not current (60)
    expect(term.scrollToLine).toHaveBeenCalledWith(50)
  })

  it('captures viewportY at call time, not callback time', () => {
    const term = makeTerm()
    term.buffer.active.viewportY = 30
    term.buffer.active.baseY = 100

    writeWithScrollGuard(term, 'data')

    // Simulate xterm changing everything during write processing
    term.buffer.active.viewportY = 100
    term.buffer.active.baseY = 120
    term.lastCallback?.()

    // Should restore to the captured position (30)
    expect(term.scrollToLine).toHaveBeenCalledWith(30)
  })

  it('does not scroll when viewportY equals baseY (zero scrollback)', () => {
    const term = makeTerm()
    term.buffer.active.viewportY = 0
    term.buffer.active.baseY = 0

    writeWithScrollGuard(term, 'first output')
    term.lastCallback?.()

    expect(term.scrollToLine).not.toHaveBeenCalled()
  })

  it('handles viewportY at line 0 when scrolled to very top', () => {
    const term = makeTerm()
    term.buffer.active.viewportY = 0
    term.buffer.active.baseY = 500

    writeWithScrollGuard(term, 'data')
    term.lastCallback?.()

    expect(term.scrollToLine).toHaveBeenCalledWith(0)
  })
})
