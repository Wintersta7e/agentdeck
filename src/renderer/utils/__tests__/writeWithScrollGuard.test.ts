import { describe, it, expect, vi } from 'vitest'
import { writeWithScrollGuard } from '../terminal-utils'
import type { WritableTerminal } from '../terminal-utils'

/** Create a mock terminal that captures the write callback */
function makeTerm(): WritableTerminal & { lastCallback: (() => void) | undefined } {
  const mock: WritableTerminal & { lastCallback: (() => void) | undefined } = {
    write: vi.fn(((_data: string, cb?: () => void) => {
      mock.lastCallback = cb
    }) as WritableTerminal['write']),
    element: null,
    lastCallback: undefined,
  }
  return mock
}

/** Create a mock viewport element with configurable scroll properties */
function makeViewport(scrollTop: number, clientHeight: number, scrollHeight: number): HTMLElement {
  return {
    scrollTop,
    clientHeight,
    scrollHeight,
  } as unknown as HTMLElement
}

describe('writeWithScrollGuard', () => {
  it('writes directly when no viewport is available', () => {
    const term = makeTerm()
    writeWithScrollGuard(term, 'hello')
    expect(term.write).toHaveBeenCalledWith('hello')
  })

  it('does not restore scroll when at bottom', () => {
    const term = makeTerm()
    // scrollTop(995) + clientHeight(500) = 1495 >= scrollHeight(1500) - 5 = 1495
    const viewport = makeViewport(995, 500, 1500)

    writeWithScrollGuard(term, 'data', viewport)
    expect(term.write).toHaveBeenCalled()

    // Simulate a scroll jump after write
    viewport.scrollTop = 1100
    term.lastCallback?.()

    // Should NOT restore because user was at bottom
    expect(viewport.scrollTop).toBe(1100)
  })

  it('does not restore scroll for small jumps (<=50px)', () => {
    const term = makeTerm()
    // User scrolled up: scrollTop(200) + clientHeight(500) = 700 < scrollHeight(2000) - 5 = 1995
    const viewport = makeViewport(200, 500, 2000)

    writeWithScrollGuard(term, 'data', viewport)

    // Small jump: 200 -> 230 = 30px
    viewport.scrollTop = 230
    term.lastCallback?.()

    // Should NOT restore because jump is <= 50px
    expect(viewport.scrollTop).toBe(230)
  })

  it('restores scroll for large jumps (>50px) when scrolled up', () => {
    const term = makeTerm()
    // User scrolled up
    const viewport = makeViewport(200, 500, 2000)

    writeWithScrollGuard(term, 'data', viewport)

    // Large jump: 200 -> 300 = 100px
    viewport.scrollTop = 300
    term.lastCallback?.()

    // Should restore to original position
    expect(viewport.scrollTop).toBe(200)
  })

  it('uses cached viewport when provided', () => {
    const term = makeTerm()
    const viewport = makeViewport(200, 500, 2000)

    writeWithScrollGuard(term, 'data', viewport)

    // Large jump
    viewport.scrollTop = 300
    term.lastCallback?.()

    expect(viewport.scrollTop).toBe(200)
  })

  it('does not restore for exactly 50px jump (threshold is >50)', () => {
    const term = makeTerm()
    const viewport = makeViewport(200, 500, 2000)

    writeWithScrollGuard(term, 'data', viewport)

    // Exactly 50px jump: |250 - 200| = 50, which is NOT > 50
    viewport.scrollTop = 250
    term.lastCallback?.()

    expect(viewport.scrollTop).toBe(250)
  })

  it('restores for 51px jump', () => {
    const term = makeTerm()
    const viewport = makeViewport(200, 500, 2000)

    writeWithScrollGuard(term, 'data', viewport)

    // 51px jump: |251 - 200| = 51, which IS > 50
    viewport.scrollTop = 251
    term.lastCallback?.()

    expect(viewport.scrollTop).toBe(200)
  })
})
