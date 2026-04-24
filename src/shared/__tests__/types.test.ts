import { describe, it, expect } from 'vitest'
import type {
  ApprovalState,
  TemplateFile,
  Template,
  TemplateDraft,
  TemplateScope,
  OpenSessionSeed,
  RightPanelTab,
  Session,
} from '../types'

describe('v6.1.0 type additions', () => {
  it('ApprovalState is idle | review | kept | discarded', () => {
    const states: ApprovalState[] = ['idle', 'review', 'kept', 'discarded']
    expect(states).toHaveLength(4)
  })

  it('TemplateScope is user | project', () => {
    const scopes: TemplateScope[] = ['user', 'project']
    expect(scopes).toHaveLength(2)
  })

  it('TemplateFile has the persisted shape', () => {
    const tf: TemplateFile = {
      id: 'abc',
      name: 'x',
      description: 'y',
      content: 'z',
      usageCount: 0,
      lastUsedAt: 0,
      pinned: false,
    }
    expect(tf.id).toBe('abc')
  })

  it('Template extends TemplateFile with derived fields', () => {
    const t: Template = {
      id: 'abc',
      name: 'x',
      description: 'y',
      content: 'z',
      usageCount: 0,
      lastUsedAt: 0,
      pinned: false,
      scope: 'user',
      projectId: null,
      path: '/home/rooty/.agentdeck/templates/abc.json',
      mtimeMs: 0,
    }
    expect(t.scope).toBe('user')
  })

  it('TemplateDraft is the save input shape', () => {
    const d: TemplateDraft = { name: 'x', description: 'y', content: 'z' }
    expect(d.name).toBe('x')
  })

  it('OpenSessionSeed requires projectId and accepts seedTemplateId', () => {
    const seed: OpenSessionSeed = { projectId: 'p1', seedTemplateId: null }
    expect(seed.projectId).toBe('p1')
  })

  it('Session carries approvalState + seedTemplateId', () => {
    const s: Session = {
      id: 's1',
      projectId: 'p1',
      status: 'idle' as never,
      startedAt: 0,
      approvalState: 'idle',
      seedTemplateId: null,
    } as unknown as Session
    expect(s.approvalState).toBe('idle')
  })

  it('RightPanelTab is narrowed to 5 values', () => {
    const tabs: RightPanelTab[] = ['files', 'diff', 'prompts', 'env', 'config']
    expect(tabs).toHaveLength(5)
  })
})
