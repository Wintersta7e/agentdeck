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
