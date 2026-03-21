import { describe, it, expect, vi } from 'vitest'
import { safeFitAndResize } from '../terminal-utils'
import type { FittableTerminal, FittableAddon, FitCallbacks } from '../terminal-utils'

function makeCallbacks(): FitCallbacks {
  return {
    syncViewport: vi.fn(),
    resizePty: vi.fn(),
  } satisfies FitCallbacks
}

function makeFit(): FittableAddon {
  return { fit: vi.fn() } satisfies FittableAddon
}

function makeTerm(cols: number, rows: number): FittableTerminal {
  return { cols, rows } satisfies FittableTerminal
}

function makeContainer(
  offsetWidth: number,
  offsetHeight: number,
): { offsetWidth: number; offsetHeight: number } {
  return { offsetWidth, offsetHeight }
}

describe('safeFitAndResize', () => {
  it('returns early when container is null', () => {
    const callbacks = makeCallbacks()
    safeFitAndResize(null, makeFit(), makeTerm(80, 24), callbacks)
    expect(callbacks.syncViewport).not.toHaveBeenCalled()
    expect(callbacks.resizePty).not.toHaveBeenCalled()
  })

  it('returns early when fit is null', () => {
    const callbacks = makeCallbacks()
    safeFitAndResize(makeContainer(800, 600), null, makeTerm(80, 24), callbacks)
    expect(callbacks.syncViewport).not.toHaveBeenCalled()
  })

  it('returns early when term is null', () => {
    const callbacks = makeCallbacks()
    safeFitAndResize(makeContainer(800, 600), makeFit(), null, callbacks)
    expect(callbacks.syncViewport).not.toHaveBeenCalled()
  })

  it('returns early when container width is zero', () => {
    const fit = makeFit()
    const callbacks = makeCallbacks()
    safeFitAndResize(makeContainer(0, 600), fit, makeTerm(80, 24), callbacks)
    expect(fit.fit).not.toHaveBeenCalled()
  })

  it('returns early when container height is zero', () => {
    const fit = makeFit()
    const callbacks = makeCallbacks()
    safeFitAndResize(makeContainer(800, 0), fit, makeTerm(80, 24), callbacks)
    expect(fit.fit).not.toHaveBeenCalled()
  })

  it('calls fit but not sync/resize when dims are unchanged', () => {
    const term = makeTerm(80, 24)
    const fit = makeFit()
    const callbacks = makeCallbacks()

    // fit() does not change term.cols/rows, so dims remain the same
    safeFitAndResize(makeContainer(800, 600), fit, term, callbacks)

    expect(fit.fit).toHaveBeenCalledOnce()
    expect(callbacks.syncViewport).not.toHaveBeenCalled()
    expect(callbacks.resizePty).not.toHaveBeenCalled()
  })

  it('calls sync and resize when dims change', () => {
    const term = makeTerm(80, 24)
    const fit: FittableAddon = {
      fit: vi.fn(() => {
        // Simulate fit() updating terminal dimensions
        term.cols = 120
        term.rows = 40
      }),
    }
    const callbacks = makeCallbacks()

    safeFitAndResize(makeContainer(800, 600), fit, term, callbacks)

    expect(fit.fit).toHaveBeenCalledOnce()
    expect(callbacks.syncViewport).toHaveBeenCalledOnce()
    expect(callbacks.resizePty).toHaveBeenCalledWith(120, 40)
  })

  it('calls sync but not resize when new dims are zero', () => {
    const term = makeTerm(80, 24)
    const fit: FittableAddon = {
      fit: vi.fn(() => {
        // Simulate fit() producing zero dimensions (e.g. collapsed pane)
        term.cols = 0
        term.rows = 0
      }),
    }
    const callbacks = makeCallbacks()

    safeFitAndResize(makeContainer(800, 600), fit, term, callbacks)

    expect(fit.fit).toHaveBeenCalledOnce()
    expect(callbacks.syncViewport).toHaveBeenCalledOnce()
    expect(callbacks.resizePty).not.toHaveBeenCalled()
  })
})
