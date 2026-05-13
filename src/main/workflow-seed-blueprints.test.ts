import { describe, it, expect } from 'vitest'
import { SEED_WORKFLOWS } from './workflow-seed-blueprints'

describe('SEED_WORKFLOWS blueprints', () => {
  it('exports at least one blueprint', () => {
    expect(SEED_WORKFLOWS.length).toBeGreaterThan(0)
  })

  it('every blueprint has a unique id', () => {
    const ids = SEED_WORKFLOWS.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every blueprint id is prefixed with seed-wf- (used by cleanup logic)', () => {
    for (const w of SEED_WORKFLOWS) {
      expect(w.id.startsWith('seed-wf-')).toBe(true)
    }
  })

  it('every blueprint has a non-empty name and description', () => {
    for (const w of SEED_WORKFLOWS) {
      expect(w.name.length).toBeGreaterThan(0)
      expect(w.description.length).toBeGreaterThan(0)
    }
  })

  it('every node id is unique within its blueprint', () => {
    for (const w of SEED_WORKFLOWS) {
      const nodeIds = w.nodes.map((n) => n.id)
      expect(new Set(nodeIds).size).toBe(nodeIds.length)
    }
  })

  it('every edge references existing node ids in the same blueprint', () => {
    for (const w of SEED_WORKFLOWS) {
      const nodeIds = new Set(w.nodes.map((n) => n.id))
      for (const e of w.edges) {
        expect(nodeIds.has(e.fromNodeId)).toBe(true)
        expect(nodeIds.has(e.toNodeId)).toBe(true)
      }
    }
  })

  it('every node has a type from the valid set', () => {
    const validTypes = new Set(['agent', 'shell', 'checkpoint', 'condition'])
    for (const w of SEED_WORKFLOWS) {
      for (const n of w.nodes) {
        expect(validTypes.has(n.type)).toBe(true)
      }
    }
  })

  it('agent nodes carry an agent identifier and a prompt', () => {
    for (const w of SEED_WORKFLOWS) {
      for (const n of w.nodes) {
        if (n.type === 'agent') {
          // Either agent or _roleName must drive the agent selection.
          expect(n.agent !== undefined || n._roleName !== undefined).toBe(true)
          // Prompts are part of the seed contract; condition nodes don't need them.
          expect(n.prompt !== undefined).toBe(true)
        }
      }
    }
  })

  it('shell nodes carry a command string', () => {
    for (const w of SEED_WORKFLOWS) {
      for (const n of w.nodes) {
        if (n.type === 'shell') {
          expect(typeof n.command).toBe('string')
          expect((n.command ?? '').length).toBeGreaterThan(0)
        }
      }
    }
  })

  it('variable names use the [A-Z_][A-Z0-9_]* convention', () => {
    const VARIABLE_NAME_RE = /^[A-Z_][A-Z0-9_]*$/
    for (const w of SEED_WORKFLOWS) {
      for (const v of w.variables ?? []) {
        expect(VARIABLE_NAME_RE.test(v.name)).toBe(true)
      }
    }
  })

  it('node coordinates are finite numbers (canvas placement)', () => {
    for (const w of SEED_WORKFLOWS) {
      for (const n of w.nodes) {
        expect(Number.isFinite(n.x)).toBe(true)
        expect(Number.isFinite(n.y)).toBe(true)
      }
    }
  })
})
