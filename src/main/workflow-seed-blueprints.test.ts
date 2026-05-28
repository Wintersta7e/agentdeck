import { describe, it, expect } from 'vitest'
import { SEED_WORKFLOWS, type SeedWorkflowBlueprint } from './workflow-seed-blueprints'
import { validateWorkflow } from '../shared/workflow-utils'
import type { Workflow, WorkflowNode, AgentType } from '../shared/types'

// Mirror the materialisation in workflow-seeds.ts (skip role resolution — irrelevant for validation).
function seedToWorkflow(b: SeedWorkflowBlueprint): Workflow {
  const nodes: WorkflowNode[] = b.nodes.map((n): WorkflowNode => {
    const base = { id: n.id, name: n.name, x: n.x, y: n.y }
    switch (n.type) {
      case 'agent': {
        const node: WorkflowNode = { ...base, type: 'agent' }
        if (n.agent !== undefined) node.agent = n.agent as AgentType
        if (n.agentFlags !== undefined) node.agentFlags = n.agentFlags
        if (n.prompt !== undefined) node.prompt = n.prompt
        return node
      }
      case 'shell': {
        const node: WorkflowNode = { ...base, type: 'shell' }
        if (n.command !== undefined) node.command = n.command
        return node
      }
      case 'checkpoint': {
        const node: WorkflowNode = { ...base, type: 'checkpoint' }
        if (n.message !== undefined) node.message = n.message
        return node
      }
      case 'condition': {
        const node: WorkflowNode = { ...base, type: 'condition' }
        if (n.conditionMode !== undefined) node.conditionMode = n.conditionMode
        if (n.conditionPattern !== undefined) node.conditionPattern = n.conditionPattern
        return node
      }
    }
  })
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    nodes,
    edges: b.edges,
    variables: b.variables,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('SEED_WORKFLOWS blueprints', () => {
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
    }
  })
})
