import { describe, it, expect } from 'vitest'
import type { Template } from '../../../shared/types'
import { getTemplatesForActiveProject } from '../templates'

function mkTemplate(partial: Partial<Template> & { id: string; name: string }): Template {
  return {
    id: partial.id,
    name: partial.name,
    description: partial.description ?? '',
    content: partial.content ?? '',
    category: partial.category,
    usageCount: partial.usageCount ?? 0,
    lastUsedAt: partial.lastUsedAt ?? 0,
    pinned: partial.pinned ?? false,
    scope: partial.scope ?? 'user',
    projectId: partial.projectId ?? null,
    path: partial.path ?? `/fake/${partial.id}.json`,
    mtimeMs: partial.mtimeMs ?? 0,
  }
}

describe('getTemplatesForActiveProject', () => {
  it('returns empty array when both pools are empty', () => {
    const state = {
      userTemplates: [] as Template[],
      projectTemplates: {} as Record<string, Template[]>,
      activeSessionId: null,
      sessions: {},
    }
    expect(getTemplatesForActiveProject(state as never)).toEqual([])
  })

  it('returns user templates sorted when only user pool has entries', () => {
    const user: Template[] = [
      mkTemplate({ id: 'u1', name: 'Beta', lastUsedAt: 200 }),
      mkTemplate({ id: 'u2', name: 'Alpha', lastUsedAt: 100 }),
    ]
    const state = {
      userTemplates: user,
      projectTemplates: {} as Record<string, Template[]>,
      activeSessionId: null,
      sessions: {},
    }
    const result = getTemplatesForActiveProject(state as never)
    expect(result.map((t) => t.id)).toEqual(['u1', 'u2']) // lastUsedAt desc
  })

  it('does not merge project pool when no session is active', () => {
    const user: Template[] = [mkTemplate({ id: 'u1', name: 'User' })]
    const projectPool: Template[] = [
      mkTemplate({ id: 'p1', name: 'Project', scope: 'project', projectId: 'proj-1' }),
    ]
    const state = {
      userTemplates: user,
      projectTemplates: { 'proj-1': projectPool },
      activeSessionId: null,
      sessions: {},
    }
    const result = getTemplatesForActiveProject(state as never)
    expect(result.map((t) => t.id)).toEqual(['u1'])
  })

  it('merges user and active-project pools with no id collisions', () => {
    const user: Template[] = [
      mkTemplate({ id: 'u1', name: 'UserA', lastUsedAt: 50 }),
      mkTemplate({ id: 'u2', name: 'UserB', lastUsedAt: 30 }),
    ]
    const projectPool: Template[] = [
      mkTemplate({
        id: 'p1',
        name: 'ProjA',
        scope: 'project',
        projectId: 'proj-1',
        lastUsedAt: 100,
      }),
    ]
    const state = {
      userTemplates: user,
      projectTemplates: { 'proj-1': projectPool },
      activeSessionId: 's1',
      sessions: { s1: { id: 's1', projectId: 'proj-1' } },
    }
    const result = getTemplatesForActiveProject(state as never)
    expect(result.map((t) => t.id)).toEqual(['p1', 'u1', 'u2']) // by lastUsedAt desc
  })

  it('project wins on id collision (project template shape returned)', () => {
    const user: Template[] = [
      mkTemplate({
        id: 'shared',
        name: 'UserVersion',
        description: 'user desc',
        scope: 'user',
      }),
    ]
    const projectPool: Template[] = [
      mkTemplate({
        id: 'shared',
        name: 'ProjectVersion',
        description: 'project desc',
        scope: 'project',
        projectId: 'proj-1',
      }),
    ]
    const state = {
      userTemplates: user,
      projectTemplates: { 'proj-1': projectPool },
      activeSessionId: 's1',
      sessions: { s1: { id: 's1', projectId: 'proj-1' } },
    }
    const result = getTemplatesForActiveProject(state as never)
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('ProjectVersion')
    expect(result[0]?.scope).toBe('project')
    expect(result[0]?.description).toBe('project desc')
  })

  it('sorts pinned templates before unpinned regardless of lastUsedAt', () => {
    const user: Template[] = [
      mkTemplate({ id: 'recent', name: 'Recent', lastUsedAt: 9999, pinned: false }),
      mkTemplate({ id: 'pinned-old', name: 'OldPinned', lastUsedAt: 1, pinned: true }),
    ]
    const state = {
      userTemplates: user,
      projectTemplates: {} as Record<string, Template[]>,
      activeSessionId: null,
      sessions: {},
    }
    const result = getTemplatesForActiveProject(state as never)
    expect(result.map((t) => t.id)).toEqual(['pinned-old', 'recent'])
  })

  it('with same pinned status, sorts by lastUsedAt descending', () => {
    const user: Template[] = [
      mkTemplate({ id: 'a', name: 'A', lastUsedAt: 100, pinned: false }),
      mkTemplate({ id: 'b', name: 'B', lastUsedAt: 500, pinned: false }),
      mkTemplate({ id: 'c', name: 'C', lastUsedAt: 300, pinned: false }),
    ]
    const state = {
      userTemplates: user,
      projectTemplates: {} as Record<string, Template[]>,
      activeSessionId: null,
      sessions: {},
    }
    const result = getTemplatesForActiveProject(state as never)
    expect(result.map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('with same pinned and lastUsedAt, sorts by name ascending', () => {
    const user: Template[] = [
      mkTemplate({ id: 'x', name: 'Charlie', lastUsedAt: 100 }),
      mkTemplate({ id: 'y', name: 'Alpha', lastUsedAt: 100 }),
      mkTemplate({ id: 'z', name: 'Bravo', lastUsedAt: 100 }),
    ]
    const state = {
      userTemplates: user,
      projectTemplates: {} as Record<string, Template[]>,
      activeSessionId: null,
      sessions: {},
    }
    const result = getTemplatesForActiveProject(state as never)
    expect(result.map((t) => t.name)).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })
})
