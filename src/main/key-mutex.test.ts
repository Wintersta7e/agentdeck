import { describe, it, expect } from 'vitest'
import { createKeyMutex } from './key-mutex'

function defer() {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createKeyMutex', () => {
  it('serializes operations sharing a key in submission order', async () => {
    const mutex = createKeyMutex()
    const order: string[] = []
    const gate = defer()

    const p1 = mutex('k', async () => {
      order.push('start1')
      await gate.promise
      order.push('end1')
    })
    const p2 = mutex('k', async () => {
      order.push('start2')
    })

    // Let microtasks flush: p2 must not begin until p1 fully resolves.
    await Promise.resolve()
    expect(order).toEqual(['start1'])

    gate.resolve()
    await Promise.all([p1, p2])
    expect(order).toEqual(['start1', 'end1', 'start2'])
  })

  it('runs operations on different keys concurrently', async () => {
    const mutex = createKeyMutex()
    const order: string[] = []
    const gateA = defer()

    const pA = mutex('a', async () => {
      order.push('startA')
      await gateA.promise
      order.push('endA')
    })
    const pB = mutex('b', async () => {
      order.push('startB')
    })

    // B completes without waiting for A's gate; A has started but is still blocked.
    await pB
    expect(order).toContain('startB')
    expect(order).toContain('startA')
    expect(order).not.toContain('endA')

    gateA.resolve()
    await pA
    expect(order).toContain('endA')
  })

  it('preserves submission order even when a later op is faster', async () => {
    const mutex = createKeyMutex()
    const order: number[] = []
    const slow = defer()

    const p1 = mutex('k', async () => {
      await slow.promise
      order.push(1)
    })
    const p2 = mutex('k', async () => {
      order.push(2)
    })

    await Promise.resolve()
    expect(order).toEqual([])

    slow.resolve()
    await Promise.all([p1, p2])
    expect(order).toEqual([1, 2])
  })

  it('isolates a rejected operation from the next one on the same key', async () => {
    const mutex = createKeyMutex()
    const p1 = mutex('k', async () => {
      throw new Error('boom')
    })
    const p2 = mutex('k', async () => 'ok')

    await expect(p1).rejects.toThrow('boom')
    await expect(p2).resolves.toBe('ok')
  })

  it('passes through the return value for sync and async functions', async () => {
    const mutex = createKeyMutex()
    await expect(mutex('x', () => 42)).resolves.toBe(42)
    await expect(mutex('y', async () => 'hi')).resolves.toBe('hi')
  })

  it('does not retain a settled chain — a fresh op on a quiet key starts immediately', async () => {
    const mutex = createKeyMutex()
    await mutex('k', async () => 'first')

    // With the chain cleaned up, the next op chains onto a resolved root and
    // runs on the next microtask rather than waiting on any stale promise.
    let started = false
    const p = mutex('k', async () => {
      started = true
    })
    await Promise.resolve()
    expect(started).toBe(true)
    await p
  })
})
