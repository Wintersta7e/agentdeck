import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AgentRegistry } from './agent-registry'

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agdeck-reg-'))
  file = join(dir, 'agents.toml')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('AgentRegistry.load', () => {
  it('has only builtins when the file is missing', () => {
    const r = new AgentRegistry(file)
    const res = r.load()
    expect(res.warnings).toEqual([])
    expect(r.has('codex')).toBe(true)
    expect(r.has('my-agent')).toBe(false)
    expect(r.all().some((a) => a.source === 'user')).toBe(false)
  })

  it('merges a valid custom agent with the builtins', () => {
    writeFileSync(
      file,
      `[[agent]]\nid="my-agent"\nbinary="my-agent-bin"\nargs=["--x"]\n[agent.ui]\nname="My Agent"\n`,
    )
    const r = new AgentRegistry(file)
    r.load()
    expect(r.has('my-agent')).toBe(true)
    expect(r.isCustom('my-agent')).toBe(true)
    expect(r.isCustom('codex')).toBe(false)
    expect(r.binaryFor('my-agent')).toBe('my-agent-bin')
    expect(r.argsFor('my-agent')).toEqual(['--x'])
    expect(r.binaryFor('codex')).toBe('codex')
    expect(r.argsFor('codex')).toEqual([])
    expect(r.knownIds().has('my-agent')).toBe(true)
    expect(r.byId('my-agent')?.name).toBe('My Agent')
  })

  it('exposes env for custom and {} for builtins', () => {
    writeFileSync(
      file,
      `[[agent]]\nid="ol"\nbinary="ollama"\n[agent.ui]\nname="Ollama"\n[agent.env]\nOLLAMA_HOST="127.0.0.1"\n`,
    )
    const r = new AgentRegistry(file)
    r.load()
    expect(r.envFor('ol')).toEqual({ OLLAMA_HOST: '127.0.0.1' })
    expect(r.envFor('codex')).toEqual({})
  })

  it('skips a custom agent that shadows a builtin id, with a warning', () => {
    writeFileSync(file, `[[agent]]\nid="codex"\nbinary="mycodex"\n[agent.ui]\nname="My Codex"\n`)
    const r = new AgentRegistry(file)
    const res = r.load()
    expect(res.warnings.length).toBe(1)
    expect(r.binaryFor('codex')).toBe('codex')
    expect(r.isCustom('codex')).toBe(false)
  })

  it('skips a duplicate id within the file, keeping the first', () => {
    writeFileSync(
      file,
      `[[agent]]\nid="dup"\nbinary="a"\n[agent.ui]\nname="A"\n[[agent]]\nid="dup"\nbinary="b"\n[agent.ui]\nname="B"\n`,
    )
    const r = new AgentRegistry(file)
    const res = r.load()
    expect(res.warnings.length).toBe(1)
    expect(r.binaryFor('dup')).toBe('a')
  })

  it('keeps valid entries and warns on an invalid one', () => {
    writeFileSync(
      file,
      `[[agent]]\nid="good"\nbinary="good-bin"\n[agent.ui]\nname="Good"\n[[agent]]\nid="bad"\nbinary="bad bin"\n[agent.ui]\nname="Bad"\n`,
    )
    const r = new AgentRegistry(file)
    const res = r.load()
    expect(r.has('good')).toBe(true)
    expect(r.has('bad')).toBe(false)
    expect(res.warnings.length).toBe(1)
  })

  it('does not crash on malformed TOML; builtins remain', () => {
    writeFileSync(file, `not valid toml = [[[`)
    const r = new AgentRegistry(file)
    const res = r.load()
    expect(res.warnings.length).toBeGreaterThan(0)
    expect(r.has('codex')).toBe(true)
    expect(r.all().some((a) => a.source === 'user')).toBe(false)
  })
})

describe('AgentRegistry CRUD', () => {
  it('saves a custom agent that survives a fresh instance', async () => {
    const a = new AgentRegistry(file)
    a.load()
    const res = await a.saveCustom({
      id: 'my-agent',
      binary: 'my-agent-bin',
      args: ['--x'],
      ui: { name: 'My Agent' },
    })
    expect(res.ok).toBe(true)
    const b = new AgentRegistry(file)
    b.load()
    expect(b.has('my-agent')).toBe(true)
    expect(b.binaryFor('my-agent')).toBe('my-agent-bin')
    expect(b.argsFor('my-agent')).toEqual(['--x'])
  })

  it('round-trips env and ui fields through TOML', async () => {
    const a = new AgentRegistry(file)
    a.load()
    await a.saveCustom({
      id: 'ol',
      binary: 'ollama',
      args: ['run', 'llama3'],
      env: { OLLAMA_HOST: '127.0.0.1' },
      ui: { name: 'Ollama', colorVar: '--green', contextWindow: 8192 },
    })
    const b = new AgentRegistry(file)
    b.load()
    expect(b.envFor('ol')).toEqual({ OLLAMA_HOST: '127.0.0.1' })
    expect(b.byId('ol')?.colorVar).toBe('--green')
    expect(b.contextWindowFor('ol')).toBe(8192)
  })

  it('rejects an invalid spec without writing', async () => {
    const a = new AgentRegistry(file)
    a.load()
    const res = await a.saveCustom({ id: 'x', binary: 'bad bin', ui: { name: 'X' } })
    expect(res.ok).toBe(false)
    expect(a.has('x')).toBe(false)
  })

  it('rejects shadowing a builtin id', async () => {
    const a = new AgentRegistry(file)
    a.load()
    const res = await a.saveCustom({ id: 'codex', binary: 'mycodex', ui: { name: 'My Codex' } })
    expect(res.ok).toBe(false)
  })

  it('deletes a custom agent and persists the removal', async () => {
    const a = new AgentRegistry(file)
    a.load()
    await a.saveCustom({ id: 'temp', binary: 'temp-bin', ui: { name: 'Temp' } })
    expect(a.has('temp')).toBe(true)
    expect(await a.deleteCustom('temp')).toBe(true)
    expect(a.has('temp')).toBe(false)
    const b = new AgentRegistry(file)
    b.load()
    expect(b.has('temp')).toBe(false)
  })

  it('returns false when deleting an unknown id', async () => {
    const a = new AgentRegistry(file)
    a.load()
    expect(await a.deleteCustom('nope')).toBe(false)
  })
})

describe('AgentRegistry.getSpec (non-lossy edit/clone source)', () => {
  it('returns the full spec (args/env/versionArgs) for a custom agent', async () => {
    const a = new AgentRegistry(file)
    a.load()
    await a.saveCustom({
      id: 'ol',
      binary: 'ollama',
      args: ['run', 'llama3'],
      env: { OLLAMA_HOST: '127.0.0.1' },
      ui: { name: 'Ollama', versionArgs: ['--version'] },
    })
    const spec = a.getSpec('ol')
    expect(spec?.args).toEqual(['run', 'llama3'])
    expect(spec?.env).toEqual({ OLLAMA_HOST: '127.0.0.1' })
    expect(spec?.ui.versionArgs).toEqual(['--version'])
  })

  it('returns undefined for builtins and unknown ids', () => {
    const a = new AgentRegistry(file)
    a.load()
    expect(a.getSpec('codex')).toBeUndefined()
    expect(a.getSpec('nope')).toBeUndefined()
  })

  it('edit round-trip: changing only the description preserves args/env/versionArgs', async () => {
    // Simulate the modal edit flow: load the full spec, change one UI field,
    // re-save. args/env/versionArgs must survive (the bug full-replaced them
    // with the redacted wire descriptor's blanks).
    const a = new AgentRegistry(file)
    a.load()
    await a.saveCustom({
      id: 'ol',
      binary: 'ollama',
      args: ['run', 'llama3'],
      env: { OLLAMA_HOST: '127.0.0.1' },
      ui: { name: 'Ollama', description: 'old', versionArgs: ['--version'] },
    })
    const prev = a.getSpec('ol')
    expect(prev).toBeDefined()
    // Re-save with the same args/env/versionArgs (as the modal now does after
    // hydrating from getCustomSpec) but a new description.
    await a.saveCustom({
      ...prev,
      ui: { ...prev!.ui, description: 'new' },
    })
    const next = a.getSpec('ol')
    expect(next?.ui.description).toBe('new')
    expect(next?.args).toEqual(['run', 'llama3'])
    expect(next?.env).toEqual({ OLLAMA_HOST: '127.0.0.1' })
    expect(next?.ui.versionArgs).toEqual(['--version'])
  })
})
