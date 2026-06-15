import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsonStore } from './json-store'

interface Item {
  id: string
  n: number
}

function tmpStore(): string {
  return join(mkdtempSync(join(tmpdir(), 'json-store-')), 'data.json')
}

function makeStore(
  storePath: string | undefined,
  extra: Partial<Parameters<typeof createJsonStore<Item>>[0]> = {},
) {
  return createJsonStore<Item>({
    storePath,
    version: 1,
    field: 'items',
    key: (it) => it.id,
    logName: 'test-store',
    ...extra,
  })
}

describe('createJsonStore', () => {
  it('round-trips items across instances via sync flush', () => {
    const path = tmpStore()
    const a = makeStore(path)
    a.map.set('x', { id: 'x', n: 1 })
    a.map.set('y', { id: 'y', n: 2 })
    a.flush()

    const b = makeStore(path)
    expect(b.map.get('x')).toEqual({ id: 'x', n: 1 })
    expect(b.map.get('y')).toEqual({ id: 'y', n: 2 })
    rmSync(path, { force: true })
  })

  it('persists under the configured envelope field with the version', () => {
    const path = tmpStore()
    const a = makeStore(path)
    a.map.set('x', { id: 'x', n: 1 })
    a.flush()

    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    expect(raw.version).toBe(1)
    expect(Array.isArray(raw.items)).toBe(true)
    expect(raw.items).toEqual([{ id: 'x', n: 1 }])
    rmSync(path, { force: true })
  })

  it('renames an unreadable file to .bad and starts empty', () => {
    const path = tmpStore()
    writeFileSync(path, '{ this is not json')

    const s = makeStore(path)
    expect(s.map.size).toBe(0)
    expect(existsSync(`${path}.bad`)).toBe(true)
    rmSync(path, { force: true })
    rmSync(`${path}.bad`, { force: true })
  })

  it('discards data written at an incompatible version', () => {
    const path = tmpStore()
    writeFileSync(path, JSON.stringify({ version: 999, items: [{ id: 'x', n: 1 }] }))

    const s = makeStore(path)
    expect(s.map.size).toBe(0)
    rmSync(path, { force: true })
  })

  it('runs onLoad over freshly loaded items (in-place migration)', () => {
    const path = tmpStore()
    writeFileSync(path, JSON.stringify({ version: 1, items: [{ id: 'x', n: 1 }] }))

    const s = makeStore(path, {
      onLoad: (items) => {
        for (const it of items) it.n *= 10
      },
    })
    expect(s.map.get('x')).toEqual({ id: 'x', n: 10 })
    rmSync(path, { force: true })
  })

  it('persists only what selectForWrite returns', () => {
    const path = tmpStore()
    const a = makeStore(path, { selectForWrite: (items) => items.filter((it) => it.n > 1) })
    a.map.set('x', { id: 'x', n: 1 })
    a.map.set('y', { id: 'y', n: 2 })
    a.flush()

    const b = makeStore(path)
    expect(b.map.has('x')).toBe(false)
    expect(b.map.get('y')).toEqual({ id: 'y', n: 2 })
    rmSync(path, { force: true })
  })

  it('writes asynchronously after the debounce window', async () => {
    const path = tmpStore()
    const s = makeStore(path, { debounceMs: 10 })
    s.map.set('x', { id: 'x', n: 1 })
    s.scheduleFlush()

    // Nothing written before the window elapses.
    expect(existsSync(path)).toBe(false)

    await new Promise((r) => setTimeout(r, 40))
    expect(existsSync(path)).toBe(true)
    expect(JSON.parse(readFileSync(path, 'utf-8')).items).toEqual([{ id: 'x', n: 1 }])
    rmSync(path, { force: true })
  })

  it('flush() cancels a pending debounce and writes synchronously', () => {
    const path = tmpStore()
    const s = makeStore(path) // default 5s debounce
    s.map.set('x', { id: 'x', n: 1 })
    s.scheduleFlush()
    s.flush()

    // Written immediately, despite the long debounce still pending.
    expect(existsSync(path)).toBe(true)
    expect(JSON.parse(readFileSync(path, 'utf-8')).items).toEqual([{ id: 'x', n: 1 }])
    rmSync(path, { force: true })
  })

  it('is purely in-memory with no storePath — flush/scheduleFlush are no-ops', () => {
    const s = makeStore(undefined)
    s.map.set('x', { id: 'x', n: 1 })
    expect(() => {
      s.scheduleFlush()
      s.flush()
    }).not.toThrow()
    expect(s.map.get('x')).toEqual({ id: 'x', n: 1 })
  })
})
