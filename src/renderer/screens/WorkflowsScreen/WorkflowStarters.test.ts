import { describe, it, expect } from 'vitest'
import { singleAgentDraft, buildAndTestDraft } from './WorkflowStarters'

describe('WorkflowStarters node ID uniqueness', () => {
  it('singleAgentDraft generates a unique node id on every call', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const wf = singleAgentDraft()
      expect(wf.nodes).toHaveLength(1)
      const id = wf.nodes[0]!.id
      expect(ids.has(id)).toBe(false)
      ids.add(id)
    }
  })

  it('buildAndTestDraft generates unique node + edge ids on every call', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const wf = buildAndTestDraft()
      expect(wf.nodes).toHaveLength(2)
      expect(wf.edges).toHaveLength(1)
      for (const n of wf.nodes) {
        expect(ids.has(n.id)).toBe(false)
        ids.add(n.id)
      }
      for (const e of wf.edges) {
        expect(ids.has(e.id)).toBe(false)
        ids.add(e.id)
      }
    }
  })

  it('buildAndTestDraft node IDs differ within the same workflow', () => {
    const wf = buildAndTestDraft()
    expect(wf.nodes[0]!.id).not.toBe(wf.nodes[1]!.id)
    expect(wf.edges[0]!.fromNodeId).toBe(wf.nodes[0]!.id)
    expect(wf.edges[0]!.toNodeId).toBe(wf.nodes[1]!.id)
  })
})
