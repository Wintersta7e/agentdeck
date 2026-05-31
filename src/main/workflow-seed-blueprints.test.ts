import { describe, it, expect } from 'vitest'
import { SEED_WORKFLOWS, type SeedWorkflowBlueprint } from './workflow-seed-blueprints'
import { materializeSeedNode } from './workflow-seed-materialize'
import { validateWorkflow } from '../shared/workflow-utils'
import type { Workflow } from '../shared/types'

// Materialise via the shared helper (workflow-seed-materialize) so this test
// validates exactly what the production seeder writes to disk. Role resolution
// is skipped (no roleMap) — irrelevant for structural validation.
function seedToWorkflow(b: SeedWorkflowBlueprint): Workflow {
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    nodes: b.nodes.map((n) => materializeSeedNode(n)),
    edges: b.edges,
    variables: b.variables,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('SEED_WORKFLOWS blueprints', () => {
  it('contains exactly 7 blueprints (the v5 seed set)', () => {
    expect(SEED_WORKFLOWS.length).toBe(7)
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

  it('write-capable seed agents are edit; review/analyze agents are read', () => {
    const byId = Object.fromEntries(SEED_WORKFLOWS.map((w) => [w.id, w]))
    const node = (wfId: string, nodeId: string) => byId[wfId]?.nodes.find((n) => n.id === nodeId)
    expect(node('seed-wf-bug-fix', 'fix')?.permission).toBe('edit')
    expect(node('seed-wf-feature-pipeline', 'build')?.permission).toBe('edit')
    expect(node('seed-wf-coverage-loop', 'write_tests')?.permission).toBe('edit')
    expect(node('seed-wf-refactor-campaign', 'refactor')?.permission).toBe('edit')
    expect(node('seed-wf-design-verify', 'write_spec')?.permission).toBe('edit')
    expect(node('seed-wf-coverage-loop', 'analyze_gaps')?.permission).toBe('read')
    expect(node('seed-wf-feature-pipeline', 'review')?.permission).toBe('read')
  })

  it('every blueprint passes validateWorkflow when materialised', () => {
    // Catches orphan edges, malformed conditions, missing agent fields, etc.
    // that would otherwise only surface at seed-time on a user's machine.
    for (const blueprint of SEED_WORKFLOWS) {
      const wf = seedToWorkflow(blueprint)
      const result = validateWorkflow(wf)
      expect(
        result.errors,
        `seed ${blueprint.id} should validate clean: ${result.errors.join('; ')}`,
      ).toEqual([])
      const fanOutWarnings = result.warnings.filter((w) => /edges with branch/i.test(w))
      expect(
        fanOutWarnings,
        `seed ${blueprint.id} should not produce branch fan-out warnings: ${fanOutWarnings.join('; ')}`,
      ).toEqual([])
    }
  })
})
